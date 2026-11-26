export const isCurrentCalendarMonth = (month, now = new Date()) =>
  Boolean(month) && month.year === now.getFullYear() && month.month === now.getMonth() + 1;

// Money actually in an account. For the current month (or no month) that is the ledger balance,
// posted transactions only; the simulator's todayBalance also subtracts unpaid bills planned for
// today, so it is used only when viewing another month.
export function liveBalance(acc, simAcc, month) {
  if ((!month || isCurrentCalendarMonth(month)) && typeof acc?.currentBalance === 'number') return acc.currentBalance;
  if (simAcc) return simAcc.todayBalance;
  return acc?.currentBalance ?? acc?.openingBalance ?? 0;
}
