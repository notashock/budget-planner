import { pool } from '../db/index.js';

export async function rollbackUnifiedTransactions() {
  console.log('=== Starting Rollback of Unified Transactions ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Remove migrated items from transactions
    console.log('1. Removing transactions that were created from legacy items...');
    await client.query(`
      DELETE FROM "transactions" WHERE "legacy_item_id" IS NOT NULL;
    `);

    // 2. Restore items table from backup if needed
    const checkBackup = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'items_backup_pre_v1');
    `);

    if (checkBackup.rows[0].exists) {
      console.log('2. Ensuring items table has all records from items_backup_pre_v1...');
      await client.query(`
        INSERT INTO "items"
        SELECT * FROM "items_backup_pre_v1"
        ON CONFLICT ("id") DO NOTHING;
      `);
    }

    // 3. Roll back goal statuses
    console.log('3. Reverting goal statuses from logged back to active...');
    await client.query(`
      UPDATE "goals"
      SET "status" = 'active'
      WHERE "status" = 'logged';
    `);

    // 4. Drop added indexes
    console.log('4. Dropping added indexes...');
    await client.query(`
      DROP INDEX IF EXISTS "idx_transactions_month_status";
      DROP INDEX IF EXISTS "idx_transactions_user_status_date";
      DROP INDEX IF EXISTS "idx_transactions_goal";
      DROP INDEX IF EXISTS "idx_transactions_legacy_item";
    `);

    // 5. Drop added columns
    console.log('5. Dropping added columns on transactions, goals, settings...');
    await client.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "legacy_item_id";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "recurrence";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "goal_id";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "planned_date";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "planned_amount";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "origin";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "status";
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "name";
      ALTER TABLE "goals" DROP COLUMN IF EXISTS "target_date";
      ALTER TABLE "settings" DROP COLUMN IF EXISTS "due_window_days";
    `);

    await client.query('COMMIT');
    console.log('=== Rollback of Unified Transactions COMPLETED SUCCESSFULLY ===');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('rollback_unified_transactions.js')) {
  rollbackUnifiedTransactions()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
