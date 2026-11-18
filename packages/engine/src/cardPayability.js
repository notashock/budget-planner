/**
 * Card Payability Score (ADR 0070): an in-app score, not a bureau credit score.
 *
 * It answers one question: "Will I be able to pay this card's next bill in full
 * when it is due?" It compares the bill you are heading for (what is already
 * billed and unpaid, plus this cycle's spend projected from your pace and your
 * last bills) with the cash you can safely spare on the due date.
 *
 * Pure: no dates are read from the clock, all money is in minor units.
 */

const toInt = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from a to b ('YYYY-MM-DD'); negative when b is before a. */
export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const [ay, am, ad] = String(a).split('-').map(Number);
  const [by, bm, bd] = String(b).split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** Whole rupees with Indian digit grouping, for the plain-language statement. */
function rupees(minor, symbol = '₹') {
  const major = Math.round(toInt(minor) / 100);
  return `${major < 0 ? '-' : ''}${symbol}${Math.abs(major).toLocaleString('en-IN')}`;
}

function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return y ? `${d} ${months[(m || 1) - 1]}` : String(iso);
}

export const PAYABILITY_BANDS = [
  { key: 'comfortable', label: 'Comfortable', min: 85 },
  { key: 'on-track', label: 'On track', min: 65 },
  { key: 'tight', label: 'Tight', min: 40 },
  { key: 'over', label: 'Over', min: 0 }
];

/** Coverage (capacity ÷ bill) to a 0-100 score, before penalties. */
export function coverageScore(coverage) {
  if (!Number.isFinite(coverage)) return 100;
  if (coverage >= 1.5) return Math.min(100, 85 + (coverage - 1.5) * 30);
  if (coverage >= 1.1) return 65 + ((coverage - 1.1) / 0.4) * 19;
  if (coverage >= 0.9) return 40 + ((coverage - 0.9) / 0.2) * 24;
  return Math.max(0, (coverage / 0.9) * 39);
}

export function bandFor(score) {
  return PAYABILITY_BANDS.find((b) => score >= b.min) || PAYABILITY_BANDS[PAYABILITY_BANDS.length - 1];
}

/**
 * Projects this cycle's spend: what is already spent, plus the remaining days at
 * a blended daily rate (60% this cycle's pace, 40% the last bills' pace), plus
 * planned charges on the card before the cycle closes.
 *
 * @param {object} p
 * @param {number} p.unbilledSoFar - spend on the card since the last statement
 * @param {number} p.daysElapsed - days of this cycle so far (today included)
 * @param {number} p.daysRemaining - days left in the cycle after today
 * @param {Array<{newSpend:number, cycleDays:number}>} [p.history] - last confirmed cycles, newest first
 * @param {number} [p.plannedOnCard=0] - planned charges on the card before the cycle closes
 */
export function projectCycleSpend({ unbilledSoFar = 0, daysElapsed = 1, daysRemaining = 0, history = [], plannedOnCard = 0 }) {
  const spent = Math.max(0, toInt(unbilledSoFar));
  const currentRate = spent / Math.max(1, daysElapsed);
  const past = (history || []).slice(0, 3).filter((h) => toInt(h.cycleDays) > 0);
  const historicalRate = past.length > 0
    ? past.reduce((sum, h) => sum + Math.max(0, toInt(h.newSpend)) / toInt(h.cycleDays), 0) / past.length
    : null;
  const rate = historicalRate === null ? currentRate : (0.6 * currentRate + 0.4 * historicalRate);
  const remaining = Math.max(0, toInt(daysRemaining));
  const projected = spent + Math.round(rate * remaining) + Math.max(0, toInt(plannedOnCard));
  return { projected, rate: Math.round(rate), currentRate: Math.round(currentRate), historicalRate: historicalRate === null ? null : Math.round(historicalRate) };
}

/**
 * Scores one card (or all cards together).
 *
 * @param {object} p
 * @param {number} p.billedUnpaid - confirmed bill not yet paid
 * @param {number} p.unbilledSoFar - spend since the last statement
 * @param {number} p.projectedCycleSpend - from projectCycleSpend()
 * @param {number} p.capacity - cash you can safely spare on the due date
 * @param {number} p.daysRemaining - days left in the cycle
 * @param {number} [p.plannedOnCard=0]
 * @param {number} [p.creditLimit=0]
 * @param {number} [p.outstanding=0] - owed on the card today
 * @param {Array<{amount:number, paidInFull?:boolean, paidLate?:boolean}>} [p.history]
 * @param {string} [p.dueDate]
 * @param {string} [p.currencySymbol='₹']
 */
export function scoreCardPayability({
  billedUnpaid = 0,
  unbilledSoFar = 0,
  projectedCycleSpend = 0,
  capacity = 0,
  daysRemaining = 0,
  plannedOnCard = 0,
  creditLimit = 0,
  outstanding = 0,
  history = [],
  dueDate = null,
  currencySymbol = '₹'
}) {
  const billed = Math.max(0, toInt(billedUnpaid));
  const projectedBill = billed + Math.max(0, toInt(projectedCycleSpend));
  const cap = toInt(capacity);
  const coverage = projectedBill > 0 ? Math.max(0, cap) / projectedBill : Infinity;

  let score = coverageScore(coverage);
  const past = (history || []).slice(0, 3);
  const latePayments = past.filter((h) => h.paidLate || h.paidInFull === false).length;
  score -= 5 * latePayments;
  const limit = Math.max(0, toInt(creditLimit));
  const utilization = limit > 0 ? Math.max(0, toInt(outstanding)) / limit : null;
  if (utilization !== null) {
    if (utilization > 0.8) score -= 10;
    else if (utilization > 0.5) score -= 5;
  }
  score = Math.round(Math.max(0, Math.min(100, score)));
  const band = bandFor(score);

  const shortfall = Math.max(0, projectedBill - Math.max(0, cap));
  const remaining = Math.max(0, toInt(daysRemaining));
  const room = Math.max(0, cap) - billed - Math.max(0, toInt(unbilledSoFar)) - Math.max(0, toInt(plannedOnCard));
  const safeCardSpendPerDay = remaining > 0 ? Math.max(0, Math.floor(room / remaining)) : 0;

  const previousBill = past.length > 0 ? Math.max(0, toInt(past[0].amount)) : null;
  const averageBill = past.length > 0
    ? Math.round(past.reduce((sum, h) => sum + Math.max(0, toInt(h.amount)), 0) / past.length)
    : null;
  // The next bill is this cycle's spend; compare it with the last bill
  const nextBill = Math.max(0, toInt(projectedCycleSpend));
  const trend = {
    previousBill,
    averageBill,
    nextBill,
    changeFromPrevious: previousBill === null ? null : nextBill - previousBill
  };

  const parts = [];
  if (projectedBill <= 0) {
    parts.push('Nothing to pay on this card so far.');
  } else {
    let lead = `At your current pace this card's ${billed > 0 ? 'next ' : ''}bill will be about ${rupees(nextBill, currencySymbol)}`;
    if (trend.changeFromPrevious !== null && Math.abs(trend.changeFromPrevious) >= 100) {
      lead += ` (${rupees(Math.abs(trend.changeFromPrevious), currencySymbol)} ${trend.changeFromPrevious > 0 ? 'more' : 'less'} than last bill)`;
    }
    parts.push(`${lead}.`);
    if (billed > 0) {
      parts.push(`${rupees(billed, currencySymbol)} is still due on the current bill, so ${rupees(projectedBill, currencySymbol)} in all.`);
    }
    parts.push(`${dueDate ? `By ${shortDate(dueDate)}` : 'When it is due'} you'll have about ${rupees(Math.max(0, cap), currencySymbol)} you can safely pay.`);
    if (shortfall > 0) {
      parts.push(`You're ${rupees(shortfall, currencySymbol)} over.`);
    } else {
      parts.push(`You can pay it in full${coverage >= 1.5 ? ' with room to spare' : ''}.`);
    }
    if (remaining > 0) {
      parts.push(safeCardSpendPerDay > 0
        ? `Keep card spending under ${rupees(safeCardSpendPerDay, currencySymbol)}/day for the remaining ${remaining} day${remaining === 1 ? '' : 's'} of this cycle to stay payable.`
        : 'Avoid new spending on this card until the bill is paid.');
    }
  }

  return {
    score,
    band: band.key,
    bandLabel: band.label,
    projectedBill,
    capacity: cap,
    coverage: Number.isFinite(coverage) ? Math.round(coverage * 100) / 100 : null,
    shortfall,
    safeCardSpendPerDay,
    daysRemaining: remaining,
    latePayments,
    utilization: utilization === null ? null : Math.round(utilization * 1000) / 1000,
    trend,
    statement: parts.join(' ')
  };
}
