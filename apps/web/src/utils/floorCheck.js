/**
 * Safety-floor check shared by every form that takes cash out of an account
 * (spend, transfer, mark as paid, lend, pay card bill).
 *
 * Balances come from the server simulation when it has the account, falling back
 * to the account record. Per ADR 0069 the check runs on the user's own money:
 * money held for other people is not available to spend.
 */

function idCandidates(account) {
  return [account?.id, account?._id].filter(Boolean).map(String);
}

function simulatedAccount(account, simulation, accountSimulations) {
  for (const id of idCandidates(account)) {
    if (accountSimulations?.[id]) return accountSimulations[id];
    if (simulation?.accounts?.[id]) return simulation.accounts[id];
  }
  return null;
}

/** Today's balance of an account, in minor units. */
export function getAccountLiveBalance(account, simulation = null, accountSimulations = {}) {
  if (!account) return 0;
  const sim = simulatedAccount(account, simulation, accountSimulations);
  if (sim && sim.todayBalance !== undefined) return Number(sim.todayBalance) || 0;
  if (typeof account.currentBalance === 'number' && account.currentBalance !== 0) return account.currentBalance;
  if (typeof account.balance === 'number' && account.balance !== 0) return account.balance;
  return account.openingBalance ?? account.currentBalance ?? account.balance ?? 0;
}

/** The account's safety floor (minimum balance), in minor units. */
export function getAccountMinimumBalance(account, simulation = null, accountSimulations = {}) {
  if (!account) return 0;
  const sim = simulatedAccount(account, simulation, accountSimulations);
  if (sim && sim.minimumBalance !== undefined) return Number(sim.minimumBalance) || 0;
  return Number(account.minimumBalance || account.safetyFloor || 0);
}

/** Money held for other people in this account today, in minor units. */
export function getAccountHeldForOthers(account, simulation = null, accountSimulations = {}) {
  const sim = simulatedAccount(account, simulation, accountSimulations);
  return Math.max(0, Number(sim?.heldForOthers) || 0);
}

/**
 * What an outflow of `amount` (minor units) does to `account`'s floor.
 * Returns null when there is nothing to check (no account, no floor, no outflow);
 * otherwise { accountName, minimumBalance, balanceAfter, breaches }.
 */
export function checkFloor(account, amount, { simulation = null, accountSimulations = {}, alreadyDebited = 0 } = {}) {
  const outflow = Math.round(Number(amount) || 0) - Math.round(Number(alreadyDebited) || 0);
  if (!account || outflow <= 0) return null;
  const minimumBalance = getAccountMinimumBalance(account, simulation, accountSimulations);
  if (minimumBalance <= 0) return null;
  const own = getAccountLiveBalance(account, simulation, accountSimulations)
    - getAccountHeldForOthers(account, simulation, accountSimulations);
  const balanceAfter = own - outflow;
  return {
    accountName: account.name || 'This account',
    minimumBalance,
    balanceAfter,
    breaches: balanceAfter < minimumBalance
  };
}

/** Find a bank account or wallet by id across both lists. */
export function findCashAccount(accountId, bankAccounts = [], wallets = []) {
  if (!accountId) return null;
  const id = String(accountId);
  return bankAccounts.find((a) => String(a.id || a._id) === id)
    || wallets.find((a) => String(a.id || a._id) === id)
    || null;
}
