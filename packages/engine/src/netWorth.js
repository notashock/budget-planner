/**
 * Net worth today (roadmap phase 6), in minor units:
 *   bank and wallet ledger balances + money others owe you (lent)
 *   − what is owed on credit cards − money you hold for others (held).
 * `accounts` are bank/wallet rows with `currentBalance` (cards and archived rows are skipped);
 * `cards` carry `outstanding` (positive = owed) or a card ledger `currentBalance` (negative = owed);
 * `personFunds` is the Held & Lent totals `{ held, lent }`.
 */
export function getNetWorth({ accounts = [], cards = [], personFunds = {} } = {}) {
  const cash = accounts
    .filter((a) => a && !a.isArchived && a.type !== 'credit_card')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
  const cardsOwed = cards
    .filter((c) => c && !c.isArchived)
    .reduce((sum, c) => sum + Math.max(0, c.outstanding ?? -(Number(c.currentBalance) || 0)), 0);
  const lent = Math.max(0, Number(personFunds.lent) || 0);
  const held = Math.max(0, Number(personFunds.held) || 0);
  return { total: cash + lent - cardsOwed - held, cash, lent, cardsOwed, held };
}
