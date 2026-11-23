import { getUnifiedVerdict } from '@budget/engine';
import { NotFoundError } from '../utils/errors.js';

// Small views of a month detail (roadmap phase 3): the Plan page loads the summary first and the chart's
// timeline only when it is shown. Both are cut from getMonthDetails, so their numbers match it exactly.

const isCurrentMonth = (month, today) => today.startsWith(`${month.year}-${String(month.month).padStart(2, '0')}`);

export function toSummary(detail, today) {
  const { month, simulation: sim, accountSimulations = {} } = detail;
  const current = isCurrentMonth(month, today);
  const verdict = getUnifiedVerdict(sim);
  const accounts = [...detail.bankAccounts, ...detail.wallets]
    .filter((a) => !a.isArchived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      // Same rule as the web's liveBalance: this month shows the ledger, other months the simulated day
      balance: current && typeof a.currentBalance === 'number'
        ? a.currentBalance
        : accountSimulations[a.id]?.todayBalance ?? a.currentBalance ?? a.openingBalance ?? 0,
      minimumBalance: a.minimumBalance ?? 0
    }));
  const nextDue = detail.transactions
    .filter((t) => t.status === 'planned' && t.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
    .slice(0, 3)
    .map((t) => ({ id: t.id, name: t.name, amount: t.amount, date: t.date, accountId: t.accountId, isIncome: t.isIncome }));

  return {
    year: month.year,
    month: month.month,
    currencySymbol: month.currencySymbol,
    safeToSpendToday: sim.safeToSpendPerDay ?? 0,
    daysLeft: sim.daysLeft ?? 0,
    verdict: verdict && { key: verdict.key, label: verdict.label },
    afterTodaysBills: sim.todayBalance ?? 0,
    lowest: { balance: sim.lowestUpcomingBalance ?? sim.lowestBalance ?? 0, date: sim.lowestUpcomingDate ?? sim.lowestDate ?? null },
    safetyFloor: sim.safetyFloor ?? 0,
    accounts,
    nextDue,
    netWorth: null // filled in by roadmap phase 6
  };
}

export function toTimeline(detail, accountId = null) {
  const { simulation: sim, accountSimulations = {} } = detail;
  const acc = accountId ? accountSimulations[accountId] : null;
  if (accountId && !acc) throw new NotFoundError('Account not found in this month');

  const touches = (e) => [e.accountId, e.sourceAccountId, e.destinationAccountId].includes(accountId);
  const events = (sim.events || [])
    .filter((e) => !accountId || touches(e))
    .map((e) => ({
      date: e.date,
      day: e.day,
      name: e.name,
      category: e.category,
      amount: e.amount,
      isIncome: e.isIncome,
      isActual: e.isActual,
      transactionId: e.transactionId,
      transferId: e.transferId,
      accountId: e.accountId,
      balanceAfter: accountId ? e.accountBalances?.[accountId] ?? e.accountBalanceAfter : e.balanceAfter
    }));
  const src = acc || sim;
  return {
    accountId,
    dailyBalances: (src.dailyBalances || []).map(({ day, date, balance }) => ({ day, date, balance })),
    events,
    lowest: { balance: src.lowestBalance ?? 0, date: src.lowestDate ?? null },
    safetyFloor: (acc ? acc.minimumBalance : sim.safetyFloor) ?? 0
  };
}
