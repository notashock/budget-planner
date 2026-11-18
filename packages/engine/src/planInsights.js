/**
 * Plan page insight helpers.
 *
 * Pure, presentation-oriented derivations over data the simulator already
 * produces (see simulator.js `simulate()` return value). Nothing here changes
 * how balances are simulated; these functions only reshape existing numbers
 * into the views a financial planner reads first. All money is in minor units.
 */

const toInt = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const isTransferEvent = (evt) =>
  evt?.itemType === 'transfer' || evt?.origin === 'transfer' || Boolean(evt?.transferId);

// Held & Lent money moves cash but is never spending or saving
const PASS_THROUGH = ['held_in', 'held_return', 'lent_out', 'lent_repaid'];
const isPassThroughEvent = (evt) =>
  evt?.itemType === 'pass-through' || PASS_THROUGH.includes(evt?.passThroughKind) || PASS_THROUGH.includes(evt?.origin);

/** Moves money without spending it: own-account transfers and held/lent money. */
const isMoneyMovement = (evt) => isTransferEvent(evt) || isPassThroughEvent(evt);

/**
 * Splits today's balance into what it is already promised to.
 *
 * Mirrors the engine's own Safe Velocity definition:
 *   freeSurplus = todayBalance − committedUpcomingItems − safetyFloor
 * so the bar always agrees with the "safe to spend per day" headline.
 * When bills + floor exceed the balance, the gap is reported as `shortfall`
 * and the floor reserve shrinks to what is actually covered.
 *
 * @returns {{ total:number, committed:number, floorReserve:number, free:number,
 *             shortfall:number, segments:Array<{key:string, amount:number}> }}
 */
export function buildCashAllocation({
  todayBalance = 0,
  committedUpcomingItems = 0,
  safetyFloor = 0,
  goalReserve = 0,
  heldReserve = 0,
  freeSurplus
} = {}) {
  const balance = Math.max(0, toInt(todayBalance));
  const committedNeed = Math.max(0, toInt(committedUpcomingItems));
  // Money held for other people is owed back, so it is set aside like a bill
  const heldNeed = Math.max(0, toInt(heldReserve));
  const floorNeed = Math.max(0, toInt(safetyFloor));
  const goalNeed = Math.max(0, toInt(goalReserve));

  // Bills are paid first, then the floor is held back, then this month's goal
  // savings are set aside, and the rest is free. This is the same order as the
  // engine's freeSurplus = today - bills - floor - goal reserve.
  const committed = Math.min(balance, committedNeed);
  const held = Math.min(balance - committed, heldNeed);
  const floorReserve = Math.min(balance - committed - held, floorNeed);
  const goalSavings = Math.min(balance - committed - held - floorReserve, goalNeed);
  const computedFree = Math.max(0, balance - committed - held - floorReserve - goalSavings);
  // Never let the engine's figure exceed what is actually left over.
  const free = freeSurplus === undefined || freeSurplus === null
    ? computedFree
    : Math.min(computedFree, Math.max(0, toInt(freeSurplus)));
  // Goals are a target, not an obligation, so they never create a shortfall.
  const shortfall = Math.max(0, committedNeed + heldNeed + floorNeed - balance);

  const segments = [
    { key: 'committed', amount: committed },
    { key: 'held', amount: held },
    { key: 'floor', amount: floorReserve },
    { key: 'goals', amount: goalSavings },
    { key: 'free', amount: free },
    { key: 'shortfall', amount: shortfall }
  ].filter((s) => s.amount > 0);

  return {
    total: balance + shortfall,
    committed,
    held,
    floorReserve,
    goalSavings,
    free,
    shortfall,
    segments
  };
}

const INVESTMENT_PATTERN = /invest|saving|\bsip\b|mutual fund|\bmf\b|fixed deposit|\bfd\b|recurring deposit|\brd\b|\bppf\b|\bnps\b|\belss\b|stock|equit|\bgold\b|retirement|pension/i;

/**
 * Whether an outflow is money set aside (saved or invested) rather than spent:
 * investment/savings categories (SIP, mutual funds, FD/RD, PPF, NPS, stocks...)
 * and goal contributions. Transfers between own accounts are neither.
 */
export function isInvestment(evt) {
  if (!evt || isMoneyMovement(evt)) return false;
  if (evt.origin === 'goal' || evt.goalId) return true;
  const text = `${evt.category || ''} ${evt.tag || ''}`;
  return INVESTMENT_PATTERN.test(text);
}

/**
 * Splits outflow events into money spent and money saved or invested.
 */
export function splitInvestments(events = []) {
  let invested = 0;
  let spending = 0;
  (events || []).forEach((evt) => {
    if (!evt || isMoneyMovement(evt)) return;
    const amt = toInt(evt.amount);
    if (amt >= 0) return;
    if (isInvestment(evt)) invested += Math.abs(amt);
    else spending += Math.abs(amt);
  });
  return { invested, spending };
}

/**
 * Projected net cash position for the period and the savings rate.
 *
 * net         = income − all outflows (the cash left over at month-end)
 * invested    = outflows that are saving or investing (SIP, FD, goals...)
 * savedAndInvested = net + invested
 * savingsRate = savedAndInvested ÷ income, so investing counts as saving,
 *               not as spending. null when there is no income.
 */
export function getNetPosition(incomeAmount = 0, totalExpenses = 0, { invested = 0 } = {}) {
  const income = toInt(incomeAmount);
  const expenses = Math.abs(toInt(totalExpenses));
  const investedAmt = Math.min(expenses, Math.max(0, toInt(invested)));
  const net = income - expenses;
  const savedAndInvested = net + investedAmt;
  const savingsRate = income > 0 ? savedAndInvested / income : null;
  return { income, expenses, net, invested: investedAmt, savedAndInvested, savingsRate };
}

/**
 * Splits expense events into what has already left the account and what is
 * still planned. Transfers are excluded (they move money, they don't spend it).
 */
export function splitPaidAndPlanned(events = []) {
  let paid = 0;
  let planned = 0;
  (events || []).forEach((evt) => {
    if (!evt || isMoneyMovement(evt)) return;
    const amt = toInt(evt.amount);
    if (amt >= 0) return;
    if (evt.isActual || evt.isPaid) paid += Math.abs(amt);
    else planned += Math.abs(amt);
  });
  return { paid, planned };
}

/**
 * Envelope pacing for the unplanned allowance.
 * expectedByToday = allowance × daysElapsed ÷ daysInMonth.
 * `status` is 'over' when spending runs more than 5% of the allowance ahead
 * of that line, 'under' when more than 5% behind, else 'on'.
 * Returns null when there is no allowance to pace against.
 */
export function getAllowancePace({
  unplannedAllowance = 0,
  totalUnplannedSpent = 0,
  daysElapsed = 1,
  daysInMonth = 30
} = {}) {
  const allowance = toInt(unplannedAllowance);
  if (allowance <= 0) return null;

  const spent = Math.max(0, toInt(totalUnplannedSpent));
  const totalDays = Math.max(1, toInt(daysInMonth));
  const elapsed = Math.min(totalDays, Math.max(0, toInt(daysElapsed)));

  const expectedByToday = Math.round((allowance * elapsed) / totalDays);
  const delta = spent - expectedByToday;
  const tolerance = Math.round(allowance * 0.05);

  let status = 'on';
  if (delta > tolerance) status = 'over';
  else if (delta < -tolerance) status = 'under';

  return {
    allowance,
    spent,
    left: allowance - spent,
    expectedByToday,
    delta,
    status,
    usedRatio: Math.min(1, spent / allowance),
    expectedRatio: Math.min(1, elapsed / totalDays)
  };
}

const addDays = (dateStr, n) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

const diffDays = (fromStr, toStr) => {
  const [y1, m1, d1] = String(fromStr).split('-').map(Number);
  const [y2, m2, d2] = String(toStr).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/**
 * Planned outflows that still need paying: anything overdue (or pending) plus
 * everything due from today through `windowDays` ahead.
 * Ordered overdue first, then by date. Also reports the next unpaid salary
 * date so the UI can say how long the money has to last.
 */
export function getUpcomingOutflows(events = [], todayStr, windowDays = 7) {
  if (!todayStr) return { items: [], total: 0, overdueCount: 0, nextSalaryDate: null, daysToSalary: null };
  const windowEnd = addDays(todayStr, Math.max(0, windowDays - 1));

  const items = [];
  let nextSalaryDate = null;

  (events || []).forEach((evt) => {
    if (!evt || !evt.date) return;

    if (evt.isSalary && !evt.isActual && evt.date >= todayStr) {
      if (!nextSalaryDate || evt.date < nextSalaryDate) nextSalaryDate = evt.date;
    }

    if (isTransferEvent(evt) || evt.isActual || evt.isPaid) return;
    const amt = toInt(evt.amount);
    if (amt >= 0) return;

    const isOverdue = Boolean(evt.isPending) || evt.date < todayStr;
    const inWindow = evt.date >= todayStr && evt.date <= windowEnd;
    if (!isOverdue && !inWindow) return;

    items.push({
      ...evt,
      outflow: Math.abs(amt),
      isOverdue,
      isDueToday: !isOverdue && evt.date === todayStr,
      dueDate: evt.isPending && evt.originalDate ? evt.originalDate : evt.date
    });
  });

  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return b.outflow - a.outflow;
  });

  return {
    items,
    total: items.reduce((s, i) => s + i.outflow, 0),
    overdueCount: items.filter((i) => i.isOverdue).length,
    nextSalaryDate,
    daysToSalary: nextSalaryDate ? diffDays(todayStr, nextSalaryDate) : null
  };
}

/**
 * Spending grouped by category, largest first, each split into paid vs still
 * planned. Categories beyond `topN` fold into "Other". Transfers excluded.
 */
export function groupSpendByCategory(events = [], { topN = 5 } = {}) {
  const map = new Map();

  (events || []).forEach((evt) => {
    if (!evt || isMoneyMovement(evt)) return;
    const amt = toInt(evt.amount);
    if (amt >= 0) return;

    const raw = String(evt.category || evt.tag || '').trim();
    const name = raw || 'Uncategorised';
    const key = name.toLowerCase();
    const entry = map.get(key) || { name, paid: 0, planned: 0, total: 0, count: 0 };
    if (evt.isActual || evt.isPaid) entry.paid += Math.abs(amt);
    else entry.planned += Math.abs(amt);
    entry.total += Math.abs(amt);
    entry.count += 1;
    map.set(key, entry);
  });

  const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const total = sorted.reduce((s, c) => s + c.total, 0);

  let categories = sorted;
  if (sorted.length > topN + 1) {
    const head = sorted.slice(0, topN);
    const rest = sorted.slice(topN);
    head.push(rest.reduce(
      (acc, c) => ({
        ...acc,
        paid: acc.paid + c.paid,
        planned: acc.planned + c.planned,
        total: acc.total + c.total,
        count: acc.count + c.count
      }),
      { name: 'Other', paid: 0, planned: 0, total: 0, count: 0, isOther: true }
    ));
    categories = head;
  }

  return {
    total,
    max: categories.reduce((m, c) => Math.max(m, c.total), 0),
    categories: categories.map((c) => ({ ...c, share: total > 0 ? c.total / total : 0 }))
  };
}

/**
 * Emergency-fund band for a runway in months, using the common 3- and
 * 6-month planning benchmarks.
 */
export function getRunwayBand(runwayMonths) {
  const m = Number(runwayMonths);
  if (m === Infinity) return { key: 'healthy', label: 'No spending recorded', min: 6 };
  if (!Number.isFinite(m) || m < 3) return { key: 'low', label: 'Below 3 months', min: 0 };
  if (m < 6) return { key: 'building', label: '3–6 months', min: 3 };
  return { key: 'healthy', label: '6+ months', min: 6 };
}

/**
 * Headroom of a balance above a minimum, as an amount and a 0–1 ratio
 * (ratio relative to the balance, so 1 means the minimum is zero).
 */
export function getHeadroom(balance = 0, minimum = 0) {
  const bal = toInt(balance);
  const min = Math.max(0, toInt(minimum));
  const amount = bal - min;
  let status = 'healthy';
  if (amount < 0) status = 'breached';
  else if (min > 0 && bal <= min * 1.15) status = 'warning';
  return {
    amount,
    ratio: bal > 0 ? Math.max(0, Math.min(1, amount / bal)) : 0,
    status
  };
}

const RESERVING_GOAL_STATUSES = new Set(['active', 'logged', 'evaluating']);

const goalFundingIds = (g) => [g?.fundingAccountId, g?.fundingBankAccountId, g?.fundingWalletId]
  .filter(Boolean)
  .map((v) => String(v._id || v.id || v));

/**
 * This month's share of each open goal: the money to set aside now so the
 * goal is fully funded by its target date.
 *
 *   reserve = ceil(targetAmount / monthsRemaining)   (this month counts as 1)
 *
 * Only goals still being saved for reserve money:
 * - 'active' / 'logged' / 'evaluating' with a target date this month or later
 * - 'scheduled' goals are already planned transactions (inside committed bills),
 *   so reserving for them would count the money twice
 * - goals without a target date, and achieved / dropped / deferred goals, reserve 0
 *
 * @param {Array<object>} goals
 * @param {{ year: number, month: number }} period
 * @returns {{ total: number, items: Array<{ goal: object, reserve: number, monthsRemaining: number, fundingIds: string[] }> }}
 */
export function getGoalMonthlyReserve(goals = [], { year, month } = {}) {
  const items = [];
  if (!year || !month) return { total: 0, items };
  const periodIndex = Number(year) * 12 + (Number(month) - 1);

  (goals || []).forEach((g) => {
    if (!g || !RESERVING_GOAL_STATUSES.has(String(g.status || 'logged').toLowerCase())) return;
    const target = toInt(g.targetAmount);
    if (target <= 0 || !g.targetDate) return;
    const [ty, tm] = String(g.targetDate).split('-').map(Number);
    if (!ty || !tm) return;
    const targetIndex = ty * 12 + (tm - 1);
    if (targetIndex < periodIndex) return; // target date already passed
    const monthsRemaining = targetIndex - periodIndex + 1;
    const reserve = Math.ceil(target / monthsRemaining);
    items.push({ goal: g, reserve, monthsRemaining, fundingIds: goalFundingIds(g) });
  });

  return { total: items.reduce((s, i) => s + i.reserve, 0), items };
}

/**
 * The month's one-line verdict, shared by the Plan page and the header so they
 * can never disagree.
 * - critical: the (upcoming) low point is below the safety floor
 * - tight:    within 15% of the floor, spending faster than the daily limit,
 *             or no daily limit left
 * - good:     otherwise
 */
export function getMonthVerdict({ lowestBalance = 0, safetyFloor = 0, paceStatus = '', safeRate = 0 } = {}) {
  const headroom = getHeadroom(lowestBalance, safetyFloor);
  const pace = String(paceStatus || '').toLowerCase();
  if (headroom.status === 'breached') return { key: 'critical', label: 'Below floor', headroom };
  if (headroom.status === 'warning' || pace.includes('contract') || pace.includes('crit') || safeRate <= 0) {
    return { key: 'tight', label: 'Tight month', headroom };
  }
  return { key: 'good', label: 'On track', headroom };
}

/**
 * Verdict for the whole household from a simulation result (all accounts).
 * Uses the upcoming low and the engine's unified floor.
 */
export function getUnifiedVerdict(simulation) {
  if (!simulation) return null;
  const sv = simulation.safeVelocity || {};
  return getMonthVerdict({
    lowestBalance: simulation.lowestUpcomingBalance ?? simulation.lowestBalance ?? 0,
    safetyFloor: simulation.safetyFloor ?? 0,
    paceStatus: sv.paceStatus || sv.status || '',
    safeRate: sv.safeVelocityPerDay ?? sv.rate ?? simulation.safeToSpendPerDay ?? 0
  });
}
