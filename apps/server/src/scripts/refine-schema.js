import { pool } from '../db/index.js';

async function refineSchema() {
  console.log('--- Applying Schema Refinements to PostgreSQL ---');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create accounts table
    console.log('Creating accounts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "subtype" text DEFAULT 'checking' NOT NULL,
        "institution" text DEFAULT '' NOT NULL,
        "account_number_masked" text DEFAULT '' NOT NULL,
        "opening_balance" bigint DEFAULT 0 NOT NULL,
        "minimum_balance" bigint DEFAULT 0 NOT NULL,
        "is_primary" boolean DEFAULT false NOT NULL,
        "is_archived" boolean DEFAULT false NOT NULL,
        "color" text DEFAULT '#09090b' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_accounts_user" ON "accounts" ("user_id", "is_archived");
    `);

    // 2. Migrate bank_accounts into accounts
    const checkBanks = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bank_accounts');
    `);
    if (checkBanks.rows[0].exists) {
      console.log('Migrating data from bank_accounts into accounts...');
      await client.query(`
        INSERT INTO "accounts" ("id", "user_id", "name", "type", "subtype", "institution", "account_number_masked", "opening_balance", "minimum_balance", "is_primary", "is_archived", "color", "created_at", "updated_at")
        SELECT "id", "user_id", "name", 'bank', "account_type", "institution", "account_number_masked", "opening_balance", "minimum_balance", "is_primary", "is_archived", "color", "created_at", "updated_at"
        FROM "bank_accounts"
        ON CONFLICT ("id") DO NOTHING;
      `);
    }

    // 3. Migrate wallets into accounts
    const checkWallets = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'wallets');
    `);
    if (checkWallets.rows[0].exists) {
      console.log('Migrating data from wallets into accounts...');
      await client.query(`
        INSERT INTO "accounts" ("id", "user_id", "name", "type", "subtype", "institution", "account_number_masked", "opening_balance", "minimum_balance", "is_primary", "is_archived", "color", "created_at", "updated_at")
        SELECT "id", "user_id", "name", 'wallet', "wallet_type", '', '', "opening_balance", 0, "is_primary", "is_archived", "color", "created_at", "updated_at"
        FROM "wallets"
        ON CONFLICT ("id") DO NOTHING;
      `);
    }

    // 4. Update users
    console.log('Refining users table...');
    await client.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "username";
    `);

    // 5. Update months
    console.log('Refining months table...');
    await client.query(`
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "salary_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkSalaryBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'months' AND column_name = 'salary_bank_account_id';
    `);
    if (checkSalaryBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "months" SET "salary_account_id" = "salary_bank_account_id" WHERE "salary_bank_account_id" IS NOT NULL;
        ALTER TABLE "months" DROP COLUMN "salary_bank_account_id";
      `);
    }
    await client.query(`
      ALTER TABLE "months" DROP COLUMN IF EXISTS "income_credit_day";
    `);

    // 6. Update month_account_openings
    console.log('Refining month_account_openings table...');
    await client.query(`
      ALTER TABLE "month_account_openings" DROP COLUMN IF EXISTS "account_type";
      ALTER TABLE "month_account_openings" DROP CONSTRAINT IF EXISTS "month_account_openings_account_id_fkey";
      ALTER TABLE "month_account_openings" DROP CONSTRAINT IF EXISTS "month_account_openings_account_id_accounts_id_fk";
      ALTER TABLE "month_account_openings" ADD CONSTRAINT "month_account_openings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
    `);

    // 7. Update items
    console.log('Refining items table...');
    await client.query(`
      ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkItemBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'bank_account_id';
    `);
    if (checkItemBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "items" SET "account_id" = COALESCE("bank_account_id", "wallet_id");
        ALTER TABLE "items" DROP COLUMN "bank_account_id";
        ALTER TABLE "items" DROP COLUMN "wallet_id";
      `);
    }

    // Ensure all items have a valid date string
    await client.query(`
      UPDATE "items"
      SET "date" = to_char("created_at", 'YYYY-MM') || '-01'
      WHERE "date" IS NULL OR "date" = '';
      ALTER TABLE "items" ALTER COLUMN "date" SET NOT NULL;
      ALTER TABLE "items" DROP COLUMN IF EXISTS "day";
      ALTER TABLE "items" DROP COLUMN IF EXISTS "day_of_month";
      ALTER TABLE "items" DROP COLUMN IF EXISTS "original_day";
      ALTER TABLE "items" DROP COLUMN IF EXISTS "original_date";
      ALTER TABLE "items" DROP COLUMN IF EXISTS "account_type";
    `);

    // 8. Drop fuel_stops
    console.log('Dropping fuel_stops table...');
    await client.query(`
      DROP TABLE IF EXISTS "fuel_stops" CASCADE;
    `);

    // 9. Update transfers
    console.log('Refining transfers table...');
    await client.query(`
      ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "source_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
      ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "destination_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkTrBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'transfers' AND column_name = 'source_bank_account_id';
    `);
    if (checkTrBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "transfers" SET "source_account_id" = COALESCE("source_bank_account_id", "source_wallet_id");
        UPDATE "transfers" SET "destination_account_id" = COALESCE("destination_bank_account_id", "destination_wallet_id");
        ALTER TABLE "transfers" DROP COLUMN "source_bank_account_id";
        ALTER TABLE "transfers" DROP COLUMN "source_wallet_id";
        ALTER TABLE "transfers" DROP COLUMN "destination_bank_account_id";
        ALTER TABLE "transfers" DROP COLUMN "destination_wallet_id";
      `);
    }
    await client.query(`
      ALTER TABLE "transfers" DROP COLUMN IF EXISTS "source_type";
      ALTER TABLE "transfers" DROP COLUMN IF EXISTS "destination_type";
    `);

    // 10. Update transactions
    console.log('Refining transactions table...');
    await client.query(`
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkTxBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'bank_account_id';
    `);
    if (checkTxBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "transactions" SET "account_id" = COALESCE("bank_account_id", "wallet_id");
        ALTER TABLE "transactions" DROP COLUMN "bank_account_id";
        ALTER TABLE "transactions" DROP COLUMN "wallet_id";
      `);
    }
    const checkTxTagCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'tag';
    `);
    if (checkTxTagCol.rows.length > 0) {
      await client.query(`
        UPDATE "transactions" SET "category" = COALESCE("category", "tag", 'Other') WHERE "category" IS NULL OR "category" = '';
        ALTER TABLE "transactions" DROP COLUMN "tag";
      `);
    }
    await client.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "account_type";
    `);

    // 11. Update goals
    console.log('Refining goals table...');
    await client.query(`
      ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "funding_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkGoalBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'funding_bank_account_id';
    `);
    if (checkGoalBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "goals" SET "funding_account_id" = COALESCE("funding_bank_account_id", "funding_wallet_id");
        ALTER TABLE "goals" DROP COLUMN "funding_bank_account_id";
        ALTER TABLE "goals" DROP COLUMN "funding_wallet_id";
      `);
    }
    await client.query(`
      ALTER TABLE "goals" DROP COLUMN IF EXISTS "funding_source_type";
    `);

    // 12. Update settings
    console.log('Refining settings table...');
    await client.query(`
      ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "default_salary_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
    `);
    const checkSetSalaryBankCol = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'default_salary_bank_account_id';
    `);
    if (checkSetSalaryBankCol.rows.length > 0) {
      await client.query(`
        UPDATE "settings" SET "default_salary_account_id" = "default_salary_bank_account_id";
        ALTER TABLE "settings" DROP COLUMN "default_salary_bank_account_id";
      `);
    }

    // 13. Drop old bank_accounts and wallets tables
    console.log('Dropping deprecated bank_accounts and wallets tables...');
    await client.query(`
      DROP TABLE IF EXISTS "bank_accounts" CASCADE;
      DROP TABLE IF EXISTS "wallets" CASCADE;
    `);

    await client.query('COMMIT');
    console.log('--- Schema Refinement COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Schema refinement failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

refineSchema().catch((err) => {
  console.error(err);
  process.exit(1);
});
