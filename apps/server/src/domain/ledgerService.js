import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import * as s from '../db/schema.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';

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
   * Retrieves all accounts for a user with materialized current balances.
   */
  async getAccountsWithBalances(userId, includeArchived = false) {
    const conditions = [eq(s.accounts.userId, userId)];
    if (!includeArchived) {
      conditions.push(eq(s.accounts.isArchived, false));
    }

    const accountRows = await db.query.accounts.findMany({
      where: and(...conditions),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });

    return serialize(accountRows);
  },

  /**
   * Atomic paired transfer creation across accounts.
   */
  async recordTransfer(userId, { sourceAccountId, destinationAccountId, amount, date, note = '', monthId = null }) {
    if (!sourceAccountId || !destinationAccountId) {
      throw new ValidationError('Source and destination accounts are required for transfer');
    }
    if (sourceAccountId === destinationAccountId) {
      throw new ValidationError('Cannot transfer funds to the same account');
    }
    const numAmount = Math.round(Number(amount) || 0);
    if (numAmount <= 0) {
      throw new ValidationError('Transfer amount must be greater than zero');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert formal transfer record
      const transferRes = await client.query(
        `INSERT INTO "transfers" ("user_id", "month_id", "source_account_id", "destination_account_id", "amount", "date", "note", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [userId, monthId, sourceAccountId, destinationAccountId, numAmount, date, note]
      );
      const transfer = transferRes.rows[0];

      // 2. Insert corresponding unified transaction
      const txRes = await client.query(
        `INSERT INTO "transactions" (
           "user_id", "month_id", "name", "status", "origin", "amount", "date", 
           "category", "note", "is_income", "account_id", "destination_account_id", "transfer_id", "created_at", "updated_at"
         )
         VALUES ($1, $2, 'Inter-Account Transfer', 'successful', 'transfer', $3, $4, 'Transfer', $5, false, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [userId, monthId, numAmount, date, note, sourceAccountId, destinationAccountId, transfer.id]
      );
      const tx = txRes.rows[0];

      // 3. Atomically update materialized balances
      await client.query(
        `UPDATE "accounts" SET "current_balance" = "current_balance" - $1, "updated_at" = NOW() WHERE "id" = $2`,
        [numAmount, sourceAccountId]
      );
      await client.query(
        `UPDATE "accounts" SET "current_balance" = "current_balance" + $1, "updated_at" = NOW() WHERE "id" = $2`,
        [numAmount, destinationAccountId]
      );

      await client.query('COMMIT');
      return {
        transfer: serialize(transfer),
        transaction: serialize(tx)
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};
