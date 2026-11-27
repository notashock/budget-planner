import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { config } from '../config.js';
import { poolSizing } from './poolSizing.js';
import { migrateLedgerAndMaterializedBalances } from '../scripts/migrate_ledger_and_materialized_balances.js';
import { installOpeningCarryTrigger, ensureOpeningCarryTrigger } from './openingCarry.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isRemoteDb = Boolean(
  config.databaseUrl && (
    config.databaseUrl.includes('supabase.co') ||
    config.databaseUrl.includes('supabase.com') ||
    config.databaseUrl.includes('pooler.supabase.com') ||
    config.databaseUrl.includes('sslmode=require') ||
    (config.isProduction && !config.databaseUrl.includes('localhost') && !config.databaseUrl.includes('127.0.0.1'))
  )
);

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Connection settings shared by the pool and any one-off client (e.g. the salary job's lock). */
export const connectionOptions = {
  connectionString: config.databaseUrl,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false
};

export const pool = new Pool({
  ...connectionOptions,
  ...poolSizing({ serverless: isServerless, production: config.isProduction })
});

export const db = drizzle(pool, { schema });

export async function healPrematurelyClosedMonths() {
  try {
    const res = await pool.query(`
      UPDATE months 
      SET is_closed = false, closed_at = NULL, closing_balances = NULL 
      WHERE is_closed = true 
        AND (
          end_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          OR (end_date IS NULL AND (year > EXTRACT(YEAR FROM CURRENT_DATE) OR (year = EXTRACT(YEAR FROM CURRENT_DATE) AND month >= EXTRACT(MONTH FROM CURRENT_DATE))))
          OR (year = EXTRACT(YEAR FROM CURRENT_DATE) AND month = EXTRACT(MONTH FROM CURRENT_DATE))
        );
    `);
    if (res.rowCount > 0) {
      console.log(`Auto-healed ${res.rowCount} prematurely closed active month(s) to open status.`);
    }
  } catch (err) {
    console.warn('Could not run healPrematurelyClosedMonths:', err.message);
  }
}

export async function pruneEmptyFutureMonths() {
  try {
    // 1. Reassign any goals from ghost future months that have no items/transactions to active current month
    await pool.query(`
      UPDATE goals g
      SET month_id = m_curr.id
      FROM months m_future
      JOIN months m_curr ON m_curr.user_id = m_future.user_id 
        AND (
          (m_curr.start_date <= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AND m_curr.end_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'))
          OR (m_curr.year = EXTRACT(YEAR FROM CURRENT_DATE) AND m_curr.month = EXTRACT(MONTH FROM CURRENT_DATE))
        )
      WHERE g.month_id = m_future.id
        AND (
          m_future.start_date > TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          OR (m_future.year > EXTRACT(YEAR FROM CURRENT_DATE) OR (m_future.year = EXTRACT(YEAR FROM CURRENT_DATE) AND m_future.month > EXTRACT(MONTH FROM CURRENT_DATE)))
        )
        AND NOT EXISTS (SELECT 1 FROM items WHERE items.month_id = m_future.id)
        AND NOT EXISTS (SELECT 1 FROM month_account_openings WHERE month_account_openings.month_id = m_future.id);
    `);

    // 2. Only delete genuinely empty ghost future months:
    // A ghost future month has NO user items, NO manual transactions, and NO account openings.
    const res = await pool.query(`
      DELETE FROM months 
      WHERE (
        start_date > TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
        OR (year > EXTRACT(YEAR FROM CURRENT_DATE) OR (year = EXTRACT(YEAR FROM CURRENT_DATE) AND month > EXTRACT(MONTH FROM CURRENT_DATE)))
      )
      AND NOT EXISTS (
        SELECT 1 FROM items WHERE items.month_id = months.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM month_account_openings WHERE month_account_openings.month_id = months.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM transactions 
        WHERE transactions.month_id = months.id 
          AND transactions.origin != 'salary'
      );
    `);
    if (res.rowCount > 0) {
      console.log(`Pruned ${res.rowCount} premature empty ghost future month(s).`);
    }
  } catch (err) {
    console.warn('Could not run pruneEmptyFutureMonths:', err.message);
  }
}

export async function syncPlannedItemsToTransactions() {
  try {
    const res = await pool.query(`
      INSERT INTO "transactions" (
        "id", "user_id", "month_id", "name", "status", "origin", "amount", "date", 
        "planned_amount", "planned_date", "category", "note", "is_income", "account_id", 
        "planned_item_id", "legacy_item_id", "created_at", "updated_at"
      )
      SELECT 
        gen_random_uuid(), i."user_id", i."month_id", i."name", 
        CASE WHEN i."is_paid" = true THEN 'successful' ELSE 'planned' END,
        'planned', i."amount", i."date", i."amount", i."date",
        COALESCE(i."category", 'General'), '', COALESCE(i."is_income", false), i."account_id",
        i."id", i."id", i."created_at", i."updated_at"
      FROM "items" i
      WHERE NOT EXISTS (
        SELECT 1 FROM "transactions" tx 
        WHERE tx."planned_item_id" = i."id" OR tx."legacy_item_id" = i."id"
      );
    `);
    if (res.rowCount > 0) {
      console.log(`Synced ${res.rowCount} planned item(s) from items table to transactions table.`);
    }
  } catch (err) {
    console.warn('Could not run syncPlannedItemsToTransactions:', err.message);
  }
}

export async function syncTransferSchema() {
  try {
    await pool.query(`
      ALTER TABLE "transactions" 
      ADD COLUMN IF NOT EXISTS "destination_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS "idx_transactions_dest_account" ON "transactions" ("destination_account_id");
    `);

    const checkTransfers = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfers');
    `);

    if (checkTransfers.rows[0].exists) {
      const res = await pool.query(`
        INSERT INTO "transactions" (
          "id",
          "user_id",
          "month_id",
          "name",
          "status",
          "origin",
          "amount",
          "date",
          "category",
          "note",
          "is_income",
          "account_id",
          "destination_account_id",
          "transfer_id",
          "created_at",
          "updated_at"
        )
        SELECT
          gen_random_uuid(),
          t."user_id",
          t."month_id",
          'Inter-Account Transfer',
          'successful',
          'transfer',
          t."amount",
          t."date",
          'Transfer',
          COALESCE(t."note", ''),
          false,
          t."source_account_id",
          t."destination_account_id",
          t."id",
          t."created_at",
          t."updated_at"
        FROM "transfers" t
        WHERE NOT EXISTS (
          SELECT 1 FROM "transactions" tx WHERE tx."transfer_id" = t."id"
        );
      `);
      if (res.rowCount > 0) {
        console.log(`Auto-backfilled ${res.rowCount} transfer(s) into transactions table with origin='transfer'.`);
      }
    }
  } catch (err) {
    console.warn('Could not run syncTransferSchema:', err.message);
  }
}

/**
 * Held & Lent money (ADR 0069): the person_funds table and the transactions.person_fund_id link.
 * Idempotent, so it is safe on every boot.
 */
export async function syncPersonFundsSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "person_funds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "person_name" text NOT NULL,
        "direction" text NOT NULL,
        "note" text DEFAULT '' NOT NULL,
        "expected_settle_date" text,
        "status" text DEFAULT 'open' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_person_funds_user" ON "person_funds" ("user_id", "status");

      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "person_fund_id" uuid REFERENCES "person_funds"("id") ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS "idx_transactions_person_fund" ON "transactions" ("person_fund_id");
    `);

    const constraints = [
      `ALTER TABLE "person_funds" ADD CONSTRAINT "chk_person_fund_direction" CHECK (direction IN ('held', 'lent'))`,
      `ALTER TABLE "person_funds" ADD CONSTRAINT "chk_person_fund_status" CHECK (status IN ('open', 'settled'))`
    ];
    for (const sql of constraints) {
      try {
        await pool.query(sql);
      } catch (e) {
        if (e.code !== '42710') console.warn('Constraint check note:', e.message);
      }
    }
  } catch (err) {
    console.warn('Could not run syncPersonFundsSchema:', err.message);
  }
}

/**
 * Credit cards (ADR 0070): card columns on accounts, the card_statements table,
 * and 'credit_card' in the account type check. Idempotent, so it is safe on every boot.
 */
/**
 * Recurring plans: their day of the month, series and Fixed/Variable mode.
 * "scheduled" rows (no month yet) are first occurrences held for a later cycle.
 */
export async function syncRecurringPlanSchema() {
  await pool.query(`
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "recurrence_day" integer;
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "series_id" uuid;
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_fixed" boolean DEFAULT true NOT NULL;
    CREATE INDEX IF NOT EXISTS "idx_transactions_series" ON "transactions" ("user_id", "series_id");
  `);
}

export async function syncCreditCardSchema() {
  try {
    await pool.query(`
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "credit_limit" bigint;
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "statement_day" integer;
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "due_day" integer;
      ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "pay_from_account_id" uuid;

      CREATE TABLE IF NOT EXISTS "card_statements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "cycle_start" text NOT NULL,
        "cycle_end" text NOT NULL,
        "due_date" text NOT NULL,
        "new_spend" bigint DEFAULT 0 NOT NULL,
        "computed_amount" bigint DEFAULT 0 NOT NULL,
        "statement_amount" bigint,
        "minimum_due" bigint,
        "status" text DEFAULT 'draft' NOT NULL,
        "confirmed_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_card_statement_cycle" ON "card_statements" ("account_id", "cycle_end");
      CREATE INDEX IF NOT EXISTS "idx_card_statements_user" ON "card_statements" ("user_id", "account_id");

      ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "chk_account_type";
      ALTER TABLE "accounts" ADD CONSTRAINT "chk_account_type" CHECK (type IN ('bank', 'wallet', 'cash', 'credit_card'));
    `);
    const constraints = [
      `ALTER TABLE "accounts" ADD CONSTRAINT "chk_card_statement_day" CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31)`,
      `ALTER TABLE "accounts" ADD CONSTRAINT "chk_card_due_day" CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31)`,
      `ALTER TABLE "card_statements" ADD CONSTRAINT "chk_card_statement_status" CHECK (status IN ('draft', 'open', 'paid', 'carried'))`
    ];
    for (const sql of constraints) {
      try {
        await pool.query(sql);
      } catch (e) {
        if (e.code !== '42710') console.warn('Constraint check note:', e.message);
      }
    }
  } catch (err) {
    console.warn('Could not run syncCreditCardSchema:', err.message);
  }
}

/**
 * Idempotent writes (middleware/idempotency.js): one row per (user, Idempotency-Key).
 * Idempotent, so it is safe on every boot.
 */
export async function syncIdempotencySchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "idempotency_keys" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "key" text NOT NULL,
        "fingerprint" text NOT NULL,
        "state" text DEFAULT 'pending' NOT NULL,
        "status_code" integer,
        "content_type" text,
        "response_body" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY ("user_id", "key")
      );
      CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_created" ON "idempotency_keys" ("created_at");
    `);
    try {
      await pool.query(`ALTER TABLE "idempotency_keys" ADD CONSTRAINT "chk_idempotency_state" CHECK (state IN ('pending', 'done'))`);
    } catch (e) {
      if (e.code !== '42710') console.warn('Constraint check note:', e.message);
    }
  } catch (err) {
    console.warn('Could not run syncIdempotencySchema:', err.message);
  }
}

export async function syncDatabaseNormalFormsAndConstraints() {
  try {
    // 1. De-duplicate any existing rows in month_account_openings before creating unique index
    await pool.query(`
      DELETE FROM month_account_openings a
      USING month_account_openings b
      WHERE a.id < b.id 
        AND a.month_id = b.month_id 
        AND a.account_id = b.account_id;
    `);

    // 2. Create 2NF composite unique index on month_account_openings
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_openings_month_account" 
      ON "month_account_openings" ("month_id", "account_id");
    `);

    // 3. Create BCNF partial unique index for single primary bank account per user
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_primary_bank" 
      ON "accounts" ("user_id") 
      WHERE "type" = 'bank' AND "is_primary" = true AND "is_archived" = false;
    `);

    // 4. Create compound index for transactions query optimization
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_month_origin_status" 
      ON "transactions" ("month_id", "origin", "status");
    `);

    // 5. Add idempotent CHECK constraints
    const constraints = [
      'ALTER TABLE "transactions" ADD CONSTRAINT "chk_tx_distinct_transfer_accounts" CHECK (origin != \'transfer\' OR (account_id IS NOT NULL AND destination_account_id IS NOT NULL AND account_id != destination_account_id))',
      'ALTER TABLE "transfers" ADD CONSTRAINT "chk_transfers_distinct_accounts" CHECK (source_account_id != destination_account_id)',
      'ALTER TABLE "transfers" ADD CONSTRAINT "chk_transfer_amount_positive" CHECK (amount > 0)',
      'ALTER TABLE "months" ADD CONSTRAINT "chk_months_month_range" CHECK (month BETWEEN 1 AND 12)',
      'ALTER TABLE "salary_templates" ADD CONSTRAINT "chk_salary_credit_day_valid" CHECK (expected_credit_day BETWEEN 1 AND 31)',
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk_account_type" CHECK (type IN (\'bank\', \'wallet\', \'cash\', \'credit_card\'))'
    ];

    for (const sql of constraints) {
      try {
        await pool.query(sql);
      } catch (e) {
        if (e.code !== '42710') {
          // 42710 = duplicate_object in postgres, safe to ignore
          console.warn('Constraint check note:', e.message);
        }
      }
    }

    console.log('Database normal forms, composite unique keys, and domain constraints synced successfully.');
  } catch (err) {
    console.warn('Could not run syncDatabaseNormalFormsAndConstraints:', err.message);
  }
}

export const CORE_APP_TABLES = [
  'users',
  'accounts',
  'months',
  'month_account_openings',
  'items',
  'transfers',
  'transactions',
  'goals',
  'salary_templates',
  'settings',
  'person_funds',
  'card_statements',
  'idempotency_keys'
];

export async function runMigrations() {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  try {
    // 1. Proactive catalog namespace cleanup: Purge any conflicting views or custom types in public
    for (const table of CORE_APP_TABLES) {
      try {
        const liveTable = await pool.query(`
          SELECT 1 FROM pg_class c 
          JOIN pg_namespace n ON n.oid = c.relnamespace 
          WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r';
        `, [table]);

        if (liveTable.rows.length === 0) {
          await pool.query(`DROP VIEW IF EXISTS public."${table}" CASCADE;`);
          await pool.query(`DROP MATERIALIZED VIEW IF EXISTS public."${table}" CASCADE;`);
          await pool.query(`DROP TYPE IF EXISTS public."${table}" CASCADE;`);
        }
      } catch (e) {
        // Safe skip
      }
    }

    // 2. Apply Drizzle migration history
    await migrate(db, { migrationsFolder });
    console.log('PostgreSQL database migrations applied successfully.');

    // 3. Synchronize cross-references and normal forms
    await syncTransferSchema();
    await syncPersonFundsSchema();
    await syncCreditCardSchema();
    await syncIdempotencySchema();
    await syncRecurringPlanSchema();
    await syncPlannedItemsToTransactions();
    await syncDatabaseNormalFormsAndConstraints();
    await migrateLedgerAndMaterializedBalances();
    await healPrematurelyClosedMonths();
    await pruneEmptyFutureMonths();
    // Last, so the one-off data syncs above don't shift later months' openings
    await installOpeningCarryTrigger(pool);

    // 4. Supabase Defense-in-Depth: Enable Row-Level Security on core tables
    for (const table of CORE_APP_TABLES) {
      try {
        await pool.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
      } catch (rlsErr) {
        // Non-blocking
      }
    }

    // Revoke public/anon access if connecting to Supabase
    try {
      await pool.query(`
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
      `);
    } catch (e) {
      // Non-blocking if role anon does not exist
    }
  } catch (err) {
    console.error('Failed to apply PostgreSQL migrations:', err);
    throw err;
  }
}

let isInitialized = false;
let initPromise = null;
let lastInitAttemptTime = 0;
const INIT_RETRY_COOLDOWN_MS = 15000;

export function isDatabaseInitialized() {
  return isInitialized;
}

// Account balances follow the ledger through this trigger; without it no write moves a balance.
// Serverless deploys never run runMigrations on an existing database, so install it here.
export async function ensureBalanceTrigger() {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_transactions_sync_balance') AS has_balance_trigger;`
  );
  if (!rows[0]?.has_balance_trigger) {
    console.log('[DevOps Auto-Init] Installing the ledger balance trigger and recomputing balances...');
    await migrateLedgerAndMaterializedBalances();
  }
}

export async function ensureDatabaseInitialized() {
  if (isInitialized) {
    return;
  }
  if (!config.databaseUrl) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }
  const now = Date.now();
  if (lastInitAttemptTime > 0 && now - lastInitAttemptTime < INIT_RETRY_COOLDOWN_MS) {
    return;
  }

  initPromise = (async () => {
    try {
      lastInitAttemptTime = Date.now();
      const checkRes = await pool.query(`
        SELECT 
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') AS has_users,
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') AS has_accounts;
      `);
      const { has_users, has_accounts } = checkRes.rows[0] || {};

      if (!has_users || !has_accounts) {
        console.log('[DevOps Auto-Init] Core tables not found in public schema. Auto-bootstrapping schema in production...');
        await runMigrations();
        console.log('[DevOps Auto-Init] Database schema bootstrap completed successfully.');
      } else {
        // Existing databases (e.g. serverless deploys that never run runMigrations):
        // add the Held & Lent schema the ORM now selects, before any query uses it.
        const ptRes = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'person_fund_id'
          ) AS has_person_fund_column;
        `);
        if (!ptRes.rows[0]?.has_person_fund_column) {
          console.log('[DevOps Auto-Init] Adding Held & Lent schema (person_funds)...');
          await syncPersonFundsSchema();
        }
        const ccRes = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'statement_day'
          ) AS has_card_columns;
        `);
        if (!ccRes.rows[0]?.has_card_columns) {
          console.log('[DevOps Auto-Init] Adding credit card schema (card_statements)...');
          await syncCreditCardSchema();
        }
        const ikRes = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'idempotency_keys'
          ) AS has_idempotency_keys;
        `);
        if (!ikRes.rows[0]?.has_idempotency_keys) {
          console.log('[DevOps Auto-Init] Adding idempotency_keys table...');
          await syncIdempotencySchema();
        }
        const rpRes = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'series_id'
          ) AS has_series_column;
        `);
        if (!rpRes.rows[0]?.has_series_column) {
          console.log('[DevOps Auto-Init] Adding recurring plan columns...');
          await syncRecurringPlanSchema();
        }
        await ensureBalanceTrigger();
        await ensureOpeningCarryTrigger(pool);
      }

      isInitialized = true;
    } catch (err) {
      console.warn('[DevOps Auto-Init] Database auto-initialization error:', err.message || err);
      if (err.message && err.message.includes('EMAXCONNSESSION')) {
        console.warn('[Data Engineer Advice] Supabase connection pool in session mode reached limit (15). Recommendation: configure DATABASE_URL to use transaction pooler port 6543 (?pgbouncer=true) or ensure serverless max pool is 1.');
      }
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export { schema };
