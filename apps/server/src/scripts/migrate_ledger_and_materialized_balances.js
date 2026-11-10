import { pool } from '../db/index.js';

export async function migrateLedgerAndMaterializedBalances() {
  console.log('=== Starting Migration: Ledger Decoupling & Materialized Account Balances ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Add current_balance column to accounts
    console.log('1. Adding current_balance column to accounts...');
    await client.query(`
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "current_balance" bigint DEFAULT 0 NOT NULL;
    `);

    // 2. Ensure transactions.month_id is nullable (continuous ledger decoupled from physical months)
    console.log('2. Ensuring transactions.month_id and transfers.month_id are nullable...');
    await client.query(`
      ALTER TABLE "transactions" ALTER COLUMN "month_id" DROP NOT NULL;
      ALTER TABLE "transfers" ALTER COLUMN "month_id" DROP NOT NULL;
    `);

    // 3. Create composite index on transactions(account_id, date)
    console.log('3. Creating composite index on transactions(account_id, date)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_account_date" ON "transactions" ("account_id", "date");
    `);

    // 4. Backfill current_balance for all accounts from opening_balance and settled transactions
    console.log('4. Backfilling materialized current_balance for all accounts...');
    const res = await client.query(`
      UPDATE "accounts" a
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
      ), 0);
    `);
    console.log(`Updated current_balance for ${res.rowCount} account(s).`);

    await client.query('COMMIT');
    console.log('=== Migration Ledger & Materialized Balances Completed Successfully ===');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('migrate_ledger_and_materialized_balances.js')) {
  migrateLedgerAndMaterializedBalances()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
