import { pool } from '../db/index.js';

/**
 * LedgerService: Core Domain Service for Account Balances and Immutable Ledger Operations.
 * Manages atomic balance materialization across transactions and transfers.
 */
export const LedgerService = {
  /**
   * Adjusts the materialized current_balance of an account by delta.
   * Multiplier is 1 for applying, -1 for reverting.
   */
  async adjustAccountBalance(accountId, deltaAmount, client = null) {
    if (!accountId || deltaAmount === 0) return;
    const executor = client || pool;
    await executor.query(
      `UPDATE "accounts" 
       SET "current_balance" = "current_balance" + $1, "updated_at" = NOW() 
       WHERE "id" = $2`,
      [deltaAmount, accountId]
    );
  },

  /**
   * Applies the balance impact of a settled transaction to its linked accounts.
   * multiplier: +1 when adding or marking paid, -1 when deleting or cancelling.
   */
  async applyTransactionBalance(tx, multiplier = 1, client = null) {
    if (!tx || tx.status !== 'successful') return;

    const amount = Number(tx.amount) || 0;
    if (amount === 0) return;

    if (tx.origin === 'transfer') {
      // Paired transfer: deduct from source, credit destination
      if (tx.accountId) {
        await this.adjustAccountBalance(tx.accountId, -1 * multiplier * amount, client);
      }
      if (tx.destinationAccountId) {
        await this.adjustAccountBalance(tx.destinationAccountId, 1 * multiplier * amount, client);
      }
    } else if (tx.isIncome) {
      // Income: credit account
      if (tx.accountId) {
        await this.adjustAccountBalance(tx.accountId, 1 * multiplier * amount, client);
      }
    } else {
      // Expense / Debit: deduct from account
      if (tx.accountId) {
        await this.adjustAccountBalance(tx.accountId, -1 * multiplier * amount, client);
      }
    }
  },

  /**
   * Calculates net balance impact for transaction edits (oldTx -> newTx).
   */
  async handleTransactionUpdateBalance(oldTx, newTx, client = null) {
    if (!oldTx || !newTx) return;

    // 1. Revert old transaction if it was successful
    if (oldTx.status === 'successful') {
      await this.applyTransactionBalance(oldTx, -1, client);
    }

    // 2. Apply new transaction if it is successful
    if (newTx.status === 'successful') {
      await this.applyTransactionBalance(newTx, 1, client);
    }
  },

  /**
   * Recalculates and updates the materialized current_balance for a single account from ledger truth.
   */
  async recomputeAccountBalance(accountId) {
    if (!accountId) return;
    await pool.query(
      `UPDATE "accounts" a
       SET "current_balance" = a."opening_balance" + COALESCE((
         SELECT SUM(
           CASE 
             WHEN t."is_income" = true THEN t."amount"
             WHEN t."origin" = 'transfer' AND t."destination_account_id" = a."id" THEN t."amount"
             WHEN t."origin" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
             ELSE -t."amount"
           END
         )
         FROM "transactions" t
         WHERE (t."account_id" = a."id" OR t."destination_account_id" = a."id")
           AND t."status" = 'successful'
       ), 0),
       "updated_at" = NOW()
       WHERE a."id" = $1`,
      [accountId]
    );
  },

  /**
   * Recalculates and updates materialized current_balance for all accounts (or a specific user's accounts).
   */
  async recomputeAllAccountBalances(userId = null) {
    const query = userId
      ? `UPDATE "accounts" a
         SET "current_balance" = a."opening_balance" + COALESCE((
           SELECT SUM(
             CASE 
               WHEN t."is_income" = true THEN t."amount"
               WHEN t."origin" = 'transfer' AND t."destination_account_id" = a."id" THEN t."amount"
               WHEN t."origin" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
               ELSE -t."amount"
             END
           )
           FROM "transactions" t
           WHERE (t."account_id" = a."id" OR t."destination_account_id" = a."id")
             AND t."status" = 'successful'
         ), 0),
         "updated_at" = NOW()
         WHERE a."user_id" = $1`
      : `UPDATE "accounts" a
         SET "current_balance" = a."opening_balance" + COALESCE((
           SELECT SUM(
             CASE 
               WHEN t."is_income" = true THEN t."amount"
               WHEN t."origin" = 'transfer' AND t."destination_account_id" = a."id" THEN t."amount"
               WHEN t."origin" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
               ELSE -t."amount"
             END
           )
           FROM "transactions" t
           WHERE (t."account_id" = a."id" OR t."destination_account_id" = a."id")
             AND t."status" = 'successful'
         ), 0),
         "updated_at" = NOW()`;
    const params = userId ? [userId] : [];
    return pool.query(query, params);
  }
};
