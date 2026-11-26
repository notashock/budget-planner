import { getDaysInMonth, clampDayToMonth, formatDate } from './calendar.js';

/**
 * Pure domain utilities for irregular income metrics and period boundary generation.
 * Zero database, timezone, or DOM dependencies.
 */

/**
 * Formats a Date object to 'YYYY-MM-DD' in UTC.
 * @param {Date} d
 * @returns {string}
 */
function toUtcIso(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses 'YYYY-MM-DD' into a UTC Date object at midnight.
 * @param {string} dateStr
 * @returns {Date}
 */
function parseUtcDate(dateStr) {
  const parts = String(dateStr).trim().split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Calculates irregular income metrics:
 * - Trailing 12-Month (T12M) Income
 * - Smoothed Monthly Income (trailing income / months of history present, at most 12)
 * - Trailing 12-Month Spending & Average Monthly Spending
 * - Emergency Runway in months (current balance / average monthly spending, safe against zero division)
 * - Quarterly and Yearly aggregates
 *
 * @param {object} params
 * @param {Array<object>} [params.transactions=[]]
 * @param {Array<object>} [params.accounts=[]]
 * @param {string} [params.asOfDate] - 'YYYY-MM-DD', defaults to today in UTC
 * @param {number} [params.windowMonths=12]
 * @returns {object}
 */
export function calculateIrregularMetrics({
  transactions = [],
  accounts = [],
  asOfDate,
  windowMonths = 12
} = {}) {
  const todayUtc = asOfDate ? parseUtcDate(asOfDate) : new Date();
  const asOfStr = asOfDate || toUtcIso(todayUtc);

  // Compute window start (12 months prior to asOfDate)
  const windowStartDate = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - windowMonths, todayUtc.getUTCDate(), 0, 0, 0, 0));
  const windowStartStr = toUtcIso(windowStartDate);

  // 1. Current balance across accounts
  const openingTotal = (accounts || []).reduce(
    (sum, acc) => sum + (Number(acc.openingBalance) || 0),
    0
  );

  // An opening balance already includes everything that happened before its
  // date, so those transactions must not be added to it again.
  const openingDateById = new Map();
  (accounts || []).forEach((acc) => {
    if (!acc || !acc.openingBalanceDate) return;
    [acc.id, acc._id, acc.altId].filter(Boolean).forEach((id) => openingDateById.set(String(id), String(acc.openingBalanceDate)));
  });
  const txAccountId = (t) => {
    const raw = t.accountId || t.bankAccountId || t.walletId;
    return raw ? String(raw._id || raw.id || raw) : null;
  };

  let currentBalance = openingTotal;
  let trailing12mIncome = 0;
  let trailing12mSpending = 0;

  const quarterlyMap = {};
  const yearlyMap = {};

  // Process transactions
  for (const t of transactions || []) {
    // Only successful transactions affect real cash balances and historical reporting
    if (t.status !== 'successful') continue;
    // Exclude zero-sum internal transfers across user accounts
    if (t.origin === 'transfer' || t.category === 'Transfer' || t.destinationAccountId || t.itemType === 'transfer' || t.isTransfer) continue;

    // Held & Lent money changes cash on hand but is never income or spending
    const passSign = (t.origin === 'held_in' || t.origin === 'lent_repaid') ? 1
      : ((t.origin === 'held_return' || t.origin === 'lent_out') ? -1 : 0);
    if (passSign !== 0) {
      const openedOnPt = openingDateById.get(txAccountId(t) || '');
      if (t.date <= asOfStr && !(openedOnPt && t.date < openedOnPt)) {
        currentBalance += passSign * Math.abs(Number(t.amount) || 0);
      }
      continue;
    }

    const tDate = t.date;
    const amount = Number(t.amount) || 0;
    const isIncome = Boolean(t.isIncome);

    // Apply to current balance if on or before asOfDate, and not already
    // reflected in its account's opening balance
    const openedOn = openingDateById.get(txAccountId(t) || '');
    const predatesOpening = Boolean(openedOn && tDate < openedOn);
    if (tDate <= asOfStr && !predatesOpening) {
      if (isIncome) {
        currentBalance += amount;
      } else {
        currentBalance -= amount; // Positive amount = expense, negative amount = refund
      }
    }

    // Check if within trailing window
    if (tDate >= windowStartStr && tDate <= asOfStr) {
      if (isIncome) {
        trailing12mIncome += amount;
      } else {
        trailing12mSpending += amount;
      }
    }

    // Quarterly and yearly aggregation
    const parts = String(tDate).split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNum = parseInt(parts[1], 10);
      const quarterNum = Math.ceil(monthNum / 3);
      const qKey = `${year}-Q${quarterNum}`;

      if (!quarterlyMap[qKey]) {
        quarterlyMap[qKey] = { quarter: `Q${quarterNum}`, year: parseInt(year, 10), income: 0, spending: 0, net: 0 };
      }
      if (!yearlyMap[year]) {
        yearlyMap[year] = { year: parseInt(year, 10), income: 0, spending: 0, net: 0 };
      }

      if (isIncome) {
        quarterlyMap[qKey].income += amount;
        yearlyMap[year].income += amount;
      } else {
        quarterlyMap[qKey].spending += amount;
        yearlyMap[year].spending += amount;
      }
      quarterlyMap[qKey].net = quarterlyMap[qKey].income - quarterlyMap[qKey].spending;
      yearlyMap[year].net = yearlyMap[year].income - yearlyMap[year].spending;
    }
  }

  // For "now", the accounts' ledger balances are the truth: the caller usually passes only one
  // month's transactions (or none), so replaying them over opening balances misses the rest.
  if (!asOfDate && accounts.length > 0 && accounts.every((a) => a && typeof a.currentBalance === 'number')) {
    currentBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  }

  // Average over the months of history actually present, not always 12.
  // Dividing a 3-month history by 12 made income and spending look 4x smaller
  // and the runway 4x longer. History starts at the later of the window start
  // and the earliest opening-balance or transaction date; whole calendar months,
  // inclusive of the as-of month, capped at the window.
  const candidateStarts = [
    ...(accounts || []).map((a) => a && a.openingBalanceDate).filter(Boolean),
    ...(transactions || [])
      .filter((t) => t && t.status === 'successful' && t.date && t.date <= asOfStr)
      .map((t) => t.date)
  ].map(String).sort();
  const earliestStr = candidateStarts.length > 0 ? candidateStarts[0] : asOfStr;
  const historyStartStr = earliestStr > windowStartStr ? earliestStr : windowStartStr;
  const [hy, hm] = historyStartStr.split('-').map(Number);
  const [ay, am] = asOfStr.split('-').map(Number);
  const calendarMonths = (ay * 12 + am) - (hy * 12 + hm) + 1;
  const monthsOfHistory = Math.max(1, Math.min(windowMonths || 12, calendarMonths));

  const smoothedMonthlyIncome = Math.round(trailing12mIncome / monthsOfHistory);
  const avgMonthlySpending = Math.max(0, Math.round(trailing12mSpending / monthsOfHistory));

  // Runway calculation with strict zero-division protection
  let runwayMonths = 0;
  let runwayDisplay = '0.0 mo';
  let isIndefinite = false;

  if (avgMonthlySpending === 0) {
    runwayMonths = Infinity;
    runwayDisplay = 'Indefinite';
    isIndefinite = true;
  } else if (currentBalance <= 0) {
    runwayMonths = 0;
    runwayDisplay = '0.0 mo';
    isIndefinite = false;
  } else {
    const raw = currentBalance / avgMonthlySpending;
    runwayMonths = Math.round(raw * 10) / 10;
    runwayDisplay = `${runwayMonths.toFixed(1)} mo`;
    isIndefinite = false;
  }

  // Sort quarters chronologically
  const quarterly = Object.keys(quarterlyMap)
    .sort()
    .map((k) => ({ key: k, ...quarterlyMap[k] }));

  // Sort years chronologically
  const yearly = Object.keys(yearlyMap)
    .sort()
    .map((k) => ({ key: k, ...yearlyMap[k] }));

  return {
    asOfDate: asOfStr,
    windowStartDate: windowStartStr,
    currentBalance,
    trailing12mIncome,
    monthsOfHistory,
    smoothedMonthlyIncome,
    trailing12mSpending,
    avgMonthlySpending,
    runwayMonths,
    runwayDisplay,
    isIndefinite,
    quarterly,
    yearly
  };
}

/**
 * Calculates start and end dates for a period, supporting calendar months and salary-to-salary cycles,
 * with first-period partial start if an openingBalanceDate exists.
 *
 * @param {object} params
 * @param {'calendar_month'|'salary_cycle'} [params.periodType='calendar_month']
 * @param {number} [params.creditDay=1] - 1 to 31
 * @param {string} params.targetDate - 'YYYY-MM-DD'
 * @param {string} [params.openingBalanceDate] - 'YYYY-MM-DD'
 * @returns {object} { startDate, originalStartDate, endDate, isPartial, periodType }
 */
export function calculatePeriodBoundaries({
  periodType = 'calendar_month',
  creditDay = 1,
  targetDate,
  openingBalanceDate
} = {}) {
  if (!targetDate) {
    throw new Error('targetDate is required to compute period boundaries.');
  }

  const parts = String(targetDate).trim().split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  let rawStart;
  let rawEnd;

  if (periodType === 'salary_cycle') {
    const targetCreditDay = Math.max(1, Math.min(31, Number(creditDay) || 1));

    if (day < targetCreditDay) {
      // Current date is before the credit day in this month -> cycle started last month on creditDay
      const prevDate = new Date(Date.UTC(year, month - 2, 1));
      const prevYear = prevDate.getUTCFullYear();
      const prevMonth = prevDate.getUTCMonth() + 1;
      const prevDays = getDaysInMonth(prevYear, prevMonth);
      const clampedPrevDay = clampDayToMonth(targetCreditDay, prevDays);
      rawStart = formatDate(prevYear, prevMonth, clampedPrevDay);

      // Cycle ends the day before credit day in current month
      const currentDays = getDaysInMonth(year, month);
      const clampedCurrentDay = clampDayToMonth(targetCreditDay, currentDays);
      const endDateObj = new Date(Date.UTC(year, month - 1, clampedCurrentDay));
      endDateObj.setUTCDate(endDateObj.getUTCDate() - 1);
      rawEnd = toUtcIso(endDateObj);
    } else {
      // Current date is on or after credit day in this month -> cycle started this month on creditDay
      const currentDays = getDaysInMonth(year, month);
      const clampedCurrentDay = clampDayToMonth(targetCreditDay, currentDays);
      rawStart = formatDate(year, month, clampedCurrentDay);

      // Cycle ends day before next month's creditDay
      const nextDate = new Date(Date.UTC(year, month, 1));
      const nextYear = nextDate.getUTCFullYear();
      const nextMonth = nextDate.getUTCMonth() + 1;
      const nextDays = getDaysInMonth(nextYear, nextMonth);
      const clampedNextDay = clampDayToMonth(targetCreditDay, nextDays);
      const endDateObj = new Date(Date.UTC(nextYear, nextMonth - 1, clampedNextDay));
      endDateObj.setUTCDate(endDateObj.getUTCDate() - 1);
      rawEnd = toUtcIso(endDateObj);
    }
  } else {
    // Standard calendar month
    rawStart = formatDate(year, month, 1);
    const daysInMonth = getDaysInMonth(year, month);
    rawEnd = formatDate(year, month, daysInMonth);
  }

  let startDate = rawStart;
  let isPartial = false;

  if (openingBalanceDate && openingBalanceDate > rawStart && openingBalanceDate <= rawEnd) {
    startDate = openingBalanceDate;
    isPartial = true;
  }

  return {
    startDate,
    originalStartDate: rawStart,
    endDate: rawEnd,
    isPartial,
    periodType
  };
}

/**
 * Computes the next period boundary given the end date of the previous period.
 *
 * @param {object} params
 * @param {'calendar_month'|'salary_cycle'} [params.periodType='calendar_month']
 * @param {number} [params.creditDay=1]
 * @param {string} params.previousEndDate - 'YYYY-MM-DD'
 * @returns {object} { startDate, endDate, periodType }
 */
export function getNextPeriodBoundaries({
  periodType = 'calendar_month',
  creditDay = 1,
  previousEndDate
} = {}) {
  const prevEnd = parseUtcDate(previousEndDate);
  const nextStartObj = new Date(prevEnd);
  nextStartObj.setUTCDate(nextStartObj.getUTCDate() + 1);
  const nextTargetDate = toUtcIso(nextStartObj);

  return calculatePeriodBoundaries({
    periodType,
    creditDay,
    targetDate: nextTargetDate
  });
}

/**
 * Determines whether a period boundary has expired (today is past the period endDate).
 *
 * @param {string} endDate - 'YYYY-MM-DD'
 * @param {string|Date} [asOfDate] - optional override date
 * @returns {boolean}
 */
export function isPeriodExpired(endDate, asOfDate = null) {
  if (!endDate) return false;
  const now = asOfDate ? new Date(asOfDate) : new Date();
  const todayIso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return todayIso > endDate;
}
