import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { config } from '../config.js';
import { migrateLedgerAndMaterializedBalances } from '../scripts/migrate_ledger_and_materialized_balances.js';

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

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
  max: isServerless ? 1 : (config.isProduction ? 10 : 4),
  idleTimeoutMillis: isServerless ? 1000 : 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: isServerless ? true : false
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
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk_account_type" CHECK (type IN (\'bank\', \'wallet\', \'cash\'))'
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
  'settings'
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
    await syncPlannedItemsToTransactions();
    await syncDatabaseNormalFormsAndConstraints();
    await migrateLedgerAndMaterializedBalances();
    await healPrematurelyClosedMonths();
    await pruneEmptyFutureMonths();

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
      }

      // Data Engineering Check: If PostgreSQL database has 0 users and MongoDB URI is available, trigger migration
      const targetMongoUri = config.mongoUri || process.env.MONGODB_URI;
      if (targetMongoUri) {
        try {
          const countUsers = await pool.query('SELECT count(*)::int AS count FROM public.users;');
          if (countUsers.rows[0]?.count === 0) {
            console.log('[Data Engineer Auto-Migration] Target users table has 0 records and MONGODB_URI is configured. Launching initial data migration...');
            const { migrateMongoToSupabase } = await import('../scripts/migrate_mongo_to_supabase.js');
            await migrateMongoToSupabase({
              databaseUrl: config.databaseUrl,
              mongoUri: targetMongoUri
            });
            console.log('[Data Engineer Auto-Migration] Initial data migration completed.');
          }
        } catch (etlErr) {
          console.warn('[Data Engineer Auto-Migration] Initial data migration notice:', etlErr.message);
        }
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
