/**
 * Smart assists for the entry sheet: spotting that a new spend pays a planned
 * bill, that "income" is salary already in the plan, or that money in or out
 * is really someone else's (held / lent).
 *
 * Pure functions; mirrored in apps/mobile/lib/engine/entry_assists.dart.
 */

const DAY_MS = 86400000;

const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function toDay(iso) {
  const t = new Date(`${String(iso || '').slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

/** Due date (YYYY-MM-DD) of a planned item, from its date or day of month. */
export function billDueDate(item, { year, month } = {}) {
  if (item?.date) return String(item.date).slice(0, 10);
  const day = item?.type === 'recurring' ? item.dayOfMonth : item?.day;
  if (!year || !month || !day || day < 1) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}`;
}

/**
 * The unpaid planned bill a new spend most likely pays, or null.
 * A bill qualifies when it is overdue or due within `windowDays`, and either its
 * amount is within `tolerance` (10%) of the spend or a word of its name appears
 * in the description. Closest amount wins; a name match breaks ties.
 */
export function findBillMatch(items, { amount = 0, description = '', today, year, month, windowDays = 7, tolerance = 0.1 } = {}) {
  const spend = Math.round(Math.abs(Number(amount) || 0));
  const descWords = new Set(words(description));
  if (!spend && descWords.size === 0) return null;
  const todayDay = toDay(today);
  let best = null;
  for (const item of items || []) {
    if (!item || item.isPaid || item.status === 'successful' || item.status === 'cancelled') continue;
    const planned = Math.abs(Number(item.plannedAmount ?? item.amount) || 0);
    const due = toDay(billDueDate(item, { year, month }));
    if (todayDay !== null && due !== null && due - todayDay > windowDays) continue;
    const amountClose = spend > 0 && planned > 0 && Math.abs(planned - spend) <= planned * tolerance;
    const nameHit = words(item.name || item.title).some((w) => descWords.has(w));
    if (!amountClose && !nameHit) continue;
    const score = (nameHit ? 0 : 1) + (spend && planned ? Math.abs(planned - spend) / planned : 1);
    if (!best || score < best.score) best = { item, score, amountClose, nameHit };
  }
  return best ? { item: best.item, amountClose: best.amountClose, nameHit: best.nameHit } : null;
}

/**
 * Whether an income entry looks like the salary the plan already schedules.
 * Returns { amount, date } of the scheduled salary, or null.
 */
export function detectDuplicateSalary({ description = '', amount = 0, month = null } = {}) {
  const salary = Math.round(Number(month?.incomeAmount) || 0);
  if (!salary) return null;
  const typed = Math.round(Math.abs(Number(amount) || 0));
  const saysSalary = /\b(salary|payroll|paycheck|pay ?slip|wages?)\b/i.test(String(description));
  const sameAmount = typed > 0 && Math.abs(typed - salary) <= salary * 0.05;
  if (!saysSalary && !sameAmount) return null;
  return { amount: salary, date: month?.incomeCreditDate || null };
}

/**
 * Someone else's money? Looks for a known person's name in the description, or
 * wording like "from Ravi", "lent to", "borrowed", "return".
 * Returns { action: 'hold'|'repaid'|'lend'|'return', fund?, personName? } or null.
 *   income (money in):  their money to hold, or a repayment of a loan
 *   spend (money out):  lending, or giving held money back
 */
export function detectPersonHint({ description = '', flow = 'in', funds = [] } = {}) {
  const text = String(description || '');
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  const fund = (funds || []).find((f) => {
    const name = String(f.personName || '').toLowerCase().trim();
    return name.length > 1 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
  }) || null;
  const lendWords = /\b(lent|lend|loan|loaned|borrow(ed)?|owes?|repay|repaid|paid back|pay back)\b/.test(lower);
  const holdWords = /\b(keep|keeping|hold|holding|safekeeping|return(ed)?|give back|gave back)\b/.test(lower);
  if (!fund && !lendWords && !holdWords) return null;

  let action;
  if (flow === 'in') {
    // Money in: they repaid a loan, or handed over money to keep
    if (fund) action = fund.direction === 'lent' ? 'repaid' : 'hold';
    else action = lendWords ? 'repaid' : 'hold';
  } else {
    // Money out: lending, or returning money that was held
    if (fund) action = fund.direction === 'held' && fund.outstanding > 0 ? 'return' : 'lend';
    else action = holdWords ? 'return' : 'lend';
  }
  const named = /\b(?:from|to|for)\s+([A-Z][a-z]+)/.exec(text);
  return { action, fund, personName: fund?.personName || named?.[1] || '' };
}
