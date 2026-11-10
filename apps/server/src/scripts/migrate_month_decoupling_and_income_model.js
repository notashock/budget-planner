import { pool } from '../db/index.js';

export async function migrateMonthDecouplingAndIncomeModel() {
  console.log('=== Starting Migration: Month Decoupling and Dual-Income Model ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Allow nullable month_id on transactions and transfers
    console.log('1. Altering transactions.month_id and transfers.month_id to be nullable...');
    await client.query(`
      ALTER TABLE "transactions" ALTER COLUMN "month_id" DROP NOT NULL;
      ALTER TABLE "transfers" ALTER COLUMN "month_id" DROP NOT NULL;
    `);

    // 2. Add opening_balance_date to accounts
    console.log('2. Adding opening_balance_date to accounts...');
    await client.query(`
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "opening_balance_date" text;
    `);

    // 3. Add start_date and end_date to months
    console.log('3. Adding start_date and end_date to months...');
    await client.query(`
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "start_date" text;
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "end_date" text;
    `);

    // 4. Add income_mode and period_type to settings
    console.log('4. Adding income_mode and period_type to settings...');
    await client.query(`
      ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "income_mode" text DEFAULT 'salary' NOT NULL;
      ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "period_type" text DEFAULT 'calendar_month' NOT NULL;
    `);

    // 5. Create salary_templates table
    console.log('5. Creating salary_templates table and indexes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "salary_templates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "amount" bigint NOT NULL,
        "expected_credit_day" integer DEFAULT 1 NOT NULL,
        "receiving_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL,
        "period_type" text DEFAULT 'calendar_month' NOT NULL,
        "effective_date" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_salary_templates_user" ON "salary_templates" ("user_id", "is_active");
    `);

    // 6. Backfill existing months start_date and end_date
    console.log('6. Backfilling start_date and end_date for existing calendar months...');
    await client.query(`
      UPDATE "months"
      SET
        "start_date" = to_char(make_date("year", "month", 1), 'YYYY-MM-DD'),
        "end_date" = to_char((make_date("year", "month", 1) + interval '1 month' - interval '1 day'), 'YYYY-MM-DD')
      WHERE "start_date" IS NULL OR "end_date" IS NULL;
    `);

    await client.query('COMMIT');
    console.log('=== Migration Month Decoupling and Dual-Income Model Completed Successfully ===');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back transaction:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow standalone CLI execution: node src/scripts/migrate_month_decoupling_and_income_model.js
if (process.argv[1] && process.argv[1].endsWith('migrate_month_decoupling_and_income_model.js')) {
  migrateMonthDecouplingAndIncomeModel()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
