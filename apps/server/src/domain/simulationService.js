import { simulate } from '@budget/engine';
import { serialize } from '../utils/serializer.js';

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
    transactions = [],
    transfers = [],
    currentDay = null
  }) {
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
        transfers: serialize(transfers)
      },
      [], // Unified transactions is the sole entity
      { year: month.year, month: month.month },
      serialize(transactions),
      [],
      serialize(transfers),
      allAccounts
    );

    return {
      simulation,
      accountSimulations: simulation.accountSimulations || {}
    };
  }
};
