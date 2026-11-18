import { eq } from 'drizzle-orm';
import { simulate } from '@budget/engine';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { serialize } from '../utils/serializer.js';

/**
 * Loads a user's goals for simulation. The engine only reserves money for open,
 * dated goals (this month's share), so passing every goal is safe; achieved,
 * dropped, scheduled and undated goals reserve nothing.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function loadGoalsForUser(userId) {
  if (!userId) return [];
  try {
    const rows = await db.select().from(schema.goals).where(eq(schema.goals.userId, userId));
    return serialize(rows);
  } catch (err) {
    console.warn('[Simulation] Could not load goals; simulating without goal reserves:', err.message || err);
    return [];
  }
}

/**
 * SimulationService: Server-side calculation adapter.
 * Executes single-pass multi-account cashflow simulations using @budget/engine.
 */
export const SimulationService = {
  /**
   * Computes authoritative single-pass simulation for a planning period.
   * Returns both the portfolio-level simulation and per-account simulation maps.
   */
  computeSimulation({
    month,
    bankAccounts = [],
    wallets = [],
    accountOpenings = [],
    items = [],
    transactions = [],
    transfers = [],
    goals = [],
    currentDay = null,
    heldContext = null
  }) {
    const held = heldContext || {};
    const personNames = held.personNames || {};
    // Label held/lent rows with the person's name
    const txsForSim = serialize(transactions).map((t) => (
      t && t.personFundId && personNames[t.personFundId] ? { ...t, personName: personNames[t.personFundId] } : t
    ));
    const allAccounts = [
      ...bankAccounts.map((b) => ({ ...b, type: 'bank' })),
      ...wallets.map((w) => ({ ...w, type: 'wallet' }))
    ];

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: month.salaryAccountId,
        isSalaryCredited: Boolean(month.isSalaryCredited),
        salaryCreditedDate: month.salaryCreditedDate,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: accountOpenings || [],
        transfers: serialize(transfers),
        heldOpeningBalance: held.heldOpeningBalance || 0,
        heldOpeningByAccount: held.heldOpeningByAccount || {},
        lentOpeningBalance: held.lentOpeningBalance || 0
      },
      serialize(items),
      { year: month.year, month: month.month },
      txsForSim,
      goals || [],
      serialize(transfers),
      allAccounts
    );

    return {
      simulation,
      accountSimulations: simulation.accountSimulations || {}
    };
  }
};
