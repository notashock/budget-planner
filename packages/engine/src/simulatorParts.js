/**
 * Pure building blocks used by simulate() (simulator.js).
 * Each one is a self-contained rule, so it can be read and tested on its own.
 */

/**
 * Computes derived transaction status based on scheduled date vs today's date.
 * Never stored; computed dynamically.
 *
 * @param {object} tx - Transaction record
 * @param {string} todayStr - Local calendar date 'YYYY-MM-DD'
 * @param {number} [dueWindowDays=3] - Days window within which a planned transaction is 'due'
 * @returns {'planned' | 'due' | 'overdue' | 'successful' | 'cancelled'}
 */
export function deriveTransactionState(tx, todayStr, dueWindowDays = 3) {
  if (!tx) return 'planned';
  const status = tx.status || 'planned';
  if (status !== 'planned') {
    return status;
  }
  const txDate = tx.plannedDate || tx.date;
  if (!txDate || !todayStr) {
    return 'planned';
  }
  if (txDate < todayStr) {
    return 'overdue';
  }
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const [pY, pM, pD] = txDate.split('-').map(Number);
  const todayUtc = Date.UTC(tY, tM - 1, tD);
  const targetUtc = Date.UTC(pY, pM - 1, pD);
  const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays >= 0 && diffDays <= dueWindowDays) {
    return 'due';
  }
  return 'planned';
}

/**
 * Held & Lent money (pass-through). Cash moves, but it is never income or expense.
 * - held_in:     someone's money arrives for you to keep     (+cash, +held)
 * - held_return: you give their money back                  (-cash, -held)
 * - lent_out:    you lend your money                        (-cash, +lent)
 * - lent_repaid: the lent money comes back                  (+cash, -lent)
 * Amounts are stored positive; the origin carries the direction.
 */
export const PASS_THROUGH_ORIGINS = Object.freeze(['held_in', 'held_return', 'lent_out', 'lent_repaid']);

export function isPassThrough(txOrOrigin) {
  const origin = typeof txOrOrigin === 'string' ? txOrOrigin : txOrOrigin?.origin;
  return PASS_THROUGH_ORIGINS.includes(origin);
}

/** +1 when cash comes in, -1 when it goes out, 0 for anything else. */
export function passThroughCashSign(origin) {
  if (origin === 'held_in' || origin === 'lent_repaid') return 1;
  if (origin === 'held_return' || origin === 'lent_out') return -1;
  return 0;
}

/** Change in what you hold for others (held) and what others owe you (lent). */
export function passThroughDeltas(origin, amount) {
  const amt = Math.abs(Math.round(Number(amount) || 0));
  switch (origin) {
    case 'held_in': return { held: amt, lent: 0 };
    case 'held_return': return { held: -amt, lent: 0 };
    case 'lent_out': return { held: 0, lent: amt };
    case 'lent_repaid': return { held: 0, lent: -amt };
    default: return { held: 0, lent: 0 };
  }
}

/**
 * Whether a transaction counts toward the day-to-day spending pace.
 * Pace compares against the discretionary daily limit, so it must only count
 * discretionary spending that actually happened: not planned bills or rent
 * (already budgeted), not goal or salary flows, not transfers, and not
 * planned/cancelled entries that have not been paid.
 */
export function isDiscretionarySpend(tx) {
  if (!tx || tx.isIncome) return false;
  if (isPassThrough(tx)) return false;
  const status = tx.status || 'successful';
  if (status !== 'successful') return false;
  if (tx.origin === 'transfer' || tx.category === 'Transfer' || tx.destinationAccountId || tx.itemType === 'transfer' || tx.isTransfer) return false;
  if (tx.origin === 'planned' || tx.origin === 'goal' || tx.origin === 'salary') return false;
  if (tx.plannedItemId || tx.goalId) return false;
  return true;
}

/**
 * Low points of a balance curve, without hiding anything that already happened.
 * - lowest: the true minimum of the whole month (past included)
 * - upcoming: the minimum from today onward (what the user can still act on)
 * - pastBreach: the first day before today that dropped below the floor, if any
 */
export function summarizeLowPoints(points = [], { currentDay = null, floor = 0, fallbackDate = '', fallbackBalance = 0 } = {}) {
  const pts = (points || []).filter((p) => p && typeof p.balance === 'number' && !Number.isNaN(p.balance));
  if (pts.length === 0) {
    const pt = { balance: fallbackBalance, date: fallbackDate };
    return { lowest: pt, upcoming: pt, pastBreach: null };
  }
  const minOf = (arr) => arr.reduce((min, p) => (p.balance < min.balance ? p : min), arr[0]);
  const hasToday = typeof currentDay === 'number' && currentDay >= 1;
  const future = hasToday ? pts.filter((p) => p.day >= currentDay) : pts;
  const past = hasToday ? pts.filter((p) => p.day < currentDay) : [];
  const lowest = minOf(pts);
  const upcoming = future.length > 0 ? minOf(future) : lowest;
  const breach = past.find((p) => p.balance < floor) || null;
  const toPt = (p) => ({ balance: p.balance, date: p.date || fallbackDate });
  return { lowest: toPt(lowest), upcoming: toPt(upcoming), pastBreach: breach ? toPt(breach) : null };
}

/** Same record, whether matched by reference, Mongo-style _id or id. */
export function isSameTransaction(tx, other) {
  if (!tx || !other) return false;
  return tx === other ||
    Boolean(tx._id && String(tx._id) === String(other._id)) ||
    Boolean(tx.id && String(tx.id) === String(other.id));
}

/**
 * The daily spending limit: what is left today after upcoming bills, the
 * safety floor and this month's goal reserve, spread over the days left.
 * Rounded down so it never overstates what can be spent.
 */
export function dailyLimit({ balance, committed = 0, floor = 0, goalReserve = 0, heldReserve = 0, daysLeft = 1 }) {
  // heldReserve: money held for other people is in the balance but is not yours to spend
  const freeSurplus = Math.max(0, balance - committed - floor - goalReserve - Math.max(0, heldReserve));
  const rate = Math.max(0, Math.floor(freeSurplus / Math.max(1, daysLeft)));
  return { freeSurplus, rate };
}

/**
 * Pace of discretionary spending against the daily limit.
 * critical: no limit left; contracting: spending >25% over it;
 * expanding: >25% under it; otherwise stable.
 */
export function classifyPace(rate, burnRatePerDay) {
  if (rate <= 0) return 'critical';
  if (burnRatePerDay > rate * 1.25) return 'contracting';
  if (burnRatePerDay < rate * 0.75) return 'expanding';
  return 'stable';
}

/**
 * One row per day for the chart and timeline: opening/closing balance, money
 * in and out, that day's events, and whether it sits below the safety floor.
 */
export function buildDayRows(dailyBalances, events, openingBalance, safetyFloor, heldByDay = null) {
  let prevBal = openingBalance;
  return dailyBalances.map((pt) => {
    const held = heldByDay ? Math.max(0, heldByDay[pt.day] || 0) : 0;
    const dayEvts = events.filter((e) => e.day === pt.day);
    let dayInflow = 0;
    let dayOutflow = 0;
    dayEvts.forEach((e) => {
      if (e.amount > 0) dayInflow += e.amount;
      if (e.amount < 0) dayOutflow += Math.abs(e.amount);
    });
    const row = {
      day: pt.day,
      date: pt.date,
      balance: pt.balance,
      openingBalance: prevBal,
      closingBalance: pt.balance,
      totalInflow: dayInflow,
      totalOutflow: dayOutflow,
      events: dayEvts,
      heldForOthers: held,
      // Money held for others does not protect the floor
      hasBreach: pt.balance - held < safetyFloor
    };
    prevBal = pt.balance;
    return row;
  });
}

/**
 * Index per-account summaries by id (and legacy alt id) and derive the
 * per-account simulation objects the isolated account view reads.
 */
export function indexAccountSummaries(accountSummaries, accountDailyBalances) {
  const accountsMap = {};
  const accountSimulations = {};
  accountSummaries.forEach((s) => {
    accountsMap[s.id] = s;
    if (s.altId) {
      accountsMap[s.altId] = s;
    }

    const accSim = {
      todayBalance: s.todayBalance,
      todaysBalance: s.todayBalance,
      endingBalance: s.endingBalance,
      lowestBalance: s.lowestBalance,
      lowestDate: s.lowestDate,
      lowestUpcomingBalance: s.lowestUpcomingBalance,
      lowestUpcomingDate: s.lowestUpcomingDate,
      pastBreach: s.pastBreach,
      floorBreached: s.floorBreached,
      dailyBalances: accountDailyBalances[s.id] || [],
      openingBalance: s.openingBalance,
      minimumBalance: s.minimumBalance,
      safetyFloor: s.minimumBalance,
      incomeAmount: s.incomeAmount,
      totalExpenses: s.totalExpenses,
      safeVelocity: s.safeVelocity
    };
    accountSimulations[s.id] = accSim;
    if (s.altId) {
      accountSimulations[s.altId] = accSim;
    }
  });
  return { accountsMap, accountSimulations };
}
