import { pool } from '../db/index.js';


/**
 * LedgerService: Core Domain Service for Account Balances and Immutable Ledger Operations.
 * Manages atomic balance materialization across transactions and transfers.
 */
export const LedgerService = {
  /**
   * Kept for the callers that run after a transaction write. The trg_transactions_sync_balance
   * trigger (migrate_ledger_and_materialized_balances.js) recomputes current_balance from the ledger
   * on every insert, update and delete, so adding a delta here as well would count it twice.
   */
  async applyTransactionBalance() {},
  async handleTransactionUpdateBalance() {},

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
