import { pool } from '../db/index.js';

export async function migrateToUnifiedTransactions() {
  console.log('=== Starting Migration to Unified Transactions ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Add new columns to transactions table
    console.log('1. Adding unified lifecycle columns to transactions...');
    await client.query(`
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "name" text DEFAULT '' NOT NULL;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'successful' NOT NULL;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'spot' NOT NULL;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "planned_amount" bigint;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "planned_date" text;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "recurrence" text;
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "legacy_item_id" uuid;
    `);

    // 2. Add columns to goals and settings
    console.log('2. Adding target_date to goals and due_window_days to settings...');
    await client.query(`
      ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "target_date" text;
      ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "due_window_days" integer DEFAULT 3 NOT NULL;
    `);

    // 3. Create indexes for efficient querying
    console.log('3. Creating transaction status and lifecycle indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_month_status" ON "transactions" ("month_id", "status");
      CREATE INDEX IF NOT EXISTS "idx_transactions_user_status_date" ON "transactions" ("user_id", "status", "date");
      CREATE INDEX IF NOT EXISTS "idx_transactions_goal" ON "transactions" ("goal_id");
      CREATE INDEX IF NOT EXISTS "idx_transactions_legacy_item" ON "transactions" ("legacy_item_id");
    `);

    // 4. Update existing spot transactions
    console.log('4. Normalizing existing recorded transactions as successful spot transactions...');
    await client.query(`
      UPDATE "transactions"
      SET
        "status" = 'successful',
        "origin" = 'spot',
        "name" = CASE
          WHEN "name" IS NOT NULL AND "name" != '' THEN "name"
          WHEN "note" IS NOT NULL AND "note" != '' THEN "note"
          ELSE COALESCE("category", 'Expense')
        END
      WHERE "origin" IS NULL OR "origin" = 'spot';
    `);

    // 5. Back up items table before migrating
    console.log('5. Creating backup table items_backup_pre_v1...');
    const checkItems = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'items');
    `);

    if (checkItems.rows[0].exists) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "items_backup_pre_v1" AS
        SELECT * FROM "items";
      `);

      // 6. Migrate items into transactions
      console.log('6. Migrating items into transactions...');
      await client.query(`
        INSERT INTO "transactions" (
          "id",
          "user_id",
          "month_id",
          "name",
          "status",
          "origin",
          "amount",
          "date",
          "planned_amount",
          "planned_date",
          "category",
          "note",
          "is_income",
          "recurrence",
          "account_id",
          "legacy_item_id",
          "created_at",
          "updated_at"
        )
        SELECT
          "id",
          "user_id",
          "month_id",
          "name",
          CASE WHEN "is_paid" = true THEN 'successful' ELSE 'planned' END AS "status",
          'planned' AS "origin",
          "amount",
          "date",
          "amount" AS "planned_amount",
          "date" AS "planned_date",
          COALESCE("category", 'General') AS "category",
          '' AS "note",
          "is_income",
          CASE WHEN "type" = 'recurring' THEN 'monthly' ELSE NULL END AS "recurrence",
          "account_id",
          "id" AS "legacy_item_id",
          "created_at",
          "updated_at"
        FROM "items"
        WHERE NOT EXISTS (
          SELECT 1 FROM "transactions" WHERE "transactions"."id" = "items"."id"
            OR "transactions"."legacy_item_id" = "items"."id"
        );
      `);

      // Clear legacy items table to prevent duplicate calculation/events
      console.log('6b. Clearing items table (backed up safely in items_backup_pre_v1)...');
      await client.query(`DELETE FROM "items";`);
    }

    // 7. Migrate goals status values
    console.log('7. Migrating goal statuses to [logged, scheduled, achieved, dropped]...');
    await client.query(`
      UPDATE "goals"
      SET "status" = CASE
        WHEN "status" = 'active' THEN 'logged'
        WHEN "status" = 'deferred' THEN 'logged'
        WHEN "status" = 'ready' THEN 'logged'
        WHEN "status" = 'evaluating' THEN 'logged'
        WHEN "status" IN ('logged', 'scheduled', 'achieved', 'dropped') THEN "status"
        ELSE 'logged'
      END;
    `);

    await client.query('COMMIT');
    console.log('=== Migration to Unified Transactions COMPLETED SUCCESSFULLY ===');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed and was rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate_to_unified_transactions.js')) {
  migrateToUnifiedTransactions()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
