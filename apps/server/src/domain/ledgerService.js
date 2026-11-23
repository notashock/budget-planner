import { pool } from '../db/index.js';

// Held & Lent (pass-through) origins: they move cash but are never income or expense
const CASH_IN_PASS_THROUGH = ['held_in', 'lent_repaid'];
const CASH_OUT_PASS_THROUGH = ['held_return', 'lent_out'];

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
    } else if (CASH_IN_PASS_THROUGH.includes(tx.origin)) {
      // Held & Lent money coming in (held_in, lent_repaid): credit account, never income
      if (tx.accountId) {
        await this.adjustAccountBalance(tx.accountId, 1 * multiplier * Math.abs(amount), client);
      }
    } else if (CASH_OUT_PASS_THROUGH.includes(tx.origin)) {
      // Held & Lent money going out (held_return, lent_out): debit account, never expense
      if (tx.accountId) {
        await this.adjustAccountBalance(tx.accountId, -1 * multiplier * Math.abs(amount), client);
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
             WHEN t."origin" IN ('held_in', 'lent_repaid') THEN ABS(t."amount")
             WHEN t."origin" IN ('held_return', 'lent_out') THEN -ABS(t."amount")
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
   * Ledger balance of each account at the start of a month: its opening balance plus successful
   * transactions dated before startDate and not before the account's opening date. The month's own
   * transactions are left out because the simulator replays them. Returns { accountId: amount }.
   */
  async balancesAtMonthStart(userId, accountIds, startDate, monthId) {
    if (!accountIds || accountIds.length === 0) return {};
    const { rows } = await pool.query(
      `SELECT a."id", a."opening_balance" + COALESCE((
         SELECT SUM(
           CASE
             WHEN t."origin" IN ('held_in', 'lent_repaid') THEN ABS(t."amount")
             WHEN t."origin" IN ('held_return', 'lent_out') THEN -ABS(t."amount")
             WHEN t."is_income" = true THEN t."amount"
             WHEN t."origin" = 'transfer' AND t."destination_account_id" = a."id" THEN t."amount"
             WHEN t."origin" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
             ELSE -t."amount"
           END
         )
         FROM "transactions" t
         WHERE (t."account_id" = a."id" OR t."destination_account_id" = a."id")
           AND t."status" = 'successful'
           AND t."date" < $2
           AND (a."opening_balance_date" IS NULL OR t."date" >= a."opening_balance_date")
           AND t."month_id" IS DISTINCT FROM $3::uuid
       ), 0) AS "amount"
       FROM "accounts" a
       WHERE a."user_id" = $1 AND a."id" = ANY($4::uuid[])`,
      [userId, startDate, monthId, accountIds]
    );
    return Object.fromEntries(rows.map((r) => [r.id, Number(r.amount)]));
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
               WHEN t."origin" IN ('held_in', 'lent_repaid') THEN ABS(t."amount")
             WHEN t."origin" IN ('held_return', 'lent_out') THEN -ABS(t."amount")
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
               WHEN t."origin" IN ('held_in', 'lent_repaid') THEN ABS(t."amount")
             WHEN t."origin" IN ('held_return', 'lent_out') THEN -ABS(t."amount")
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
