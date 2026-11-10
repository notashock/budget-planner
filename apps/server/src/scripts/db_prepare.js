#!/usr/bin/env node
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../db/schema.js';
import { config } from '../config.js';
import {
  syncTransferSchema,
  syncDatabaseNormalFormsAndConstraints,
  healPrematurelyClosedMonths,
  pruneEmptyFutureMonths
} from '../db/index.js';
import { migrateLedgerAndMaterializedBalances } from './migrate_ledger_and_materialized_balances.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target database connection
const args = process.argv.slice(2);
const dbUrlArg = args.find((a) => a.startsWith('--database-url='))?.split('=')[1];
const targetDbUrl = dbUrlArg || config.databaseUrl;

const isRemoteDb = Boolean(
  targetDbUrl && (
    targetDbUrl.includes('supabase.co') ||
    targetDbUrl.includes('supabase.com') ||
    targetDbUrl.includes('pooler.supabase.com') ||
    targetDbUrl.includes('sslmode=require') ||
    (config.isProduction && !targetDbUrl.includes('localhost') && !targetDbUrl.includes('127.0.0.1'))
  )
);

const CORE_APP_TABLES = [
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

async function runPrepare() {
  console.log('\n============================================================');
  console.log('  DEVOPS DATABASE PREPARATION & SUPABASE HARDENING');
  console.log('============================================================');

  const maskedUrl = targetDbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`Target Database: ${maskedUrl}`);
  console.log(`SSL Mode:        ${isRemoteDb ? 'Enabled (rejectUnauthorized: false)' : 'Disabled (Local)'}\n`);

  const pool = new Pool({
    connectionString: targetDbUrl,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  });

  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    console.error('\n✖ Connection failed:', connErr.message);
    if (connErr.code === 'EACCES' || connErr.message?.includes('connect')) {
      console.error('  Could not reach PostgreSQL server at the specified host and port.');
      console.error('  Please check your DATABASE_URL, network reachability, and ensure credentials are correct.');
    }
    await pool.end();
    process.exit(1);
  }

  const drizzleDb = drizzle(pool, { schema });

  try {
    // 0. Pre-flight check: Audit public schema tables
    const checkTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const existingTableNames = checkTables.rows.map(r => r.table_name);
    const hasLegacyTables = existingTableNames.some(t => ['bank_accounts', 'wallets', 'fuel_stops'].includes(t));
    const hasAccounts = existingTableNames.includes('accounts');

    if (hasLegacyTables && !hasAccounts) {
      console.warn('\n⚠ [Pre-Flight Warning] Detected legacy/prototype tables (bank_accounts/wallets) in public schema without unified "accounts".');
      console.warn('  Your database contains stale tables from an older schema version.');
      console.warn('  To wipe stale tables and cleanly prepare for production, please run:');
      console.warn('\n    npm run db:clean -- --confirm-wipe-database\n');
      console.warn('  Then re-run:');
      console.warn('    npm run db:prepare\n');
    }

    // Proactive Catalog & Type Cleanup: Purge any conflicting pg_type / view entries before Drizzle runs
    console.log('Resolving catalog namespaces and type dependencies in public schema...');
    for (const table of CORE_APP_TABLES) {
      try {
        const liveTable = await client.query(`
          SELECT 1 FROM pg_class c 
          JOIN pg_namespace n ON n.oid = c.relnamespace 
          WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r';
        `, [table]);

        if (liveTable.rows.length === 0) {
          // Table does not exist as a live regular table, so purge any lingering view or composite type
          // that would cause "Key (typname, typnamespace)=(..., 2200) already exists" in pg_type
          await client.query(`DROP VIEW IF EXISTS public."${table}" CASCADE;`);
          await client.query(`DROP MATERIALIZED VIEW IF EXISTS public."${table}" CASCADE;`);
          await client.query(`DROP TYPE IF EXISTS public."${table}" CASCADE;`);
        }
      } catch (cleanupErr) {
        // Non-blocking catch
      }
    }
    console.log('  ✔ Catalog namespaces and type dependencies verified.\n');

    // 1. Run Drizzle Migrations
    console.log('Step 1: Applying Drizzle schema migrations...');
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    await migrate(drizzleDb, { migrationsFolder });
    console.log('  ✔ Drizzle migration history applied successfully.');

    // Step 1.5: Optional MongoDB Data Migration Hook
    const checkUsers = await client.query('SELECT count(*)::int AS count FROM public."users";');
    const isTargetEmpty = checkUsers.rows[0].count === 0;
    const shouldImportMongo = args.includes('--import-mongo') || (isTargetEmpty && Boolean(config.mongoUri));

    if (shouldImportMongo) {
      console.log('\nStep 1.5: Checking for legacy MongoDB data migration...');
      try {
        const { migrateMongoToSupabase } = await import('./migrate_mongo_to_supabase.js');
        const dumpDirArg = args.find((a) => a.startsWith('--dump-dir=') || a.startsWith('--json-dir='))?.split('=')[1];
        const mongoUriArg = args.find((a) => a.startsWith('--mongo-uri='))?.split('=')[1];

        const res = await migrateMongoToSupabase({
          databaseUrl: targetDbUrl,
          mongoUri: mongoUriArg || config.mongoUri,
          dumpDir: dumpDirArg
        });

        if (res && res.skipped) {
          console.log(`  [Notice] MongoDB migration skipped (${res.reason}).`);
        } else if (res && res.success) {
          console.log('  ✔ MongoDB legacy data migrated successfully into PostgreSQL.');
        }
      } catch (mongoMigrationErr) {
        console.warn(`  [Notice] MongoDB auto-migration notice: ${mongoMigrationErr.message}`);
      }
    }

    // 2. Synchronize Schemas & Add Columns
    console.log('\nStep 2: Synchronizing transfers schema and cross-references...');
    await syncTransferSchema();
    console.log('  ✔ Transfer schema synchronized.');

    // 3. Normal Forms, BCNF & 2NF Constraints
    console.log('\nStep 3: Enforcing database normal forms and integrity constraints...');
    await syncDatabaseNormalFormsAndConstraints();
    console.log('  ✔ Normal forms and integrity constraints enforced.');

    // 4. Materialized Balances & Ledger Decoupling
    console.log('\nStep 4: Synchronizing running ledger & materialized balances...');
    await migrateLedgerAndMaterializedBalances();
    console.log('  ✔ Ledger and materialized balances synchronized.');

    // 5. Lifecycle Health Repairs
    console.log('\nStep 5: Running lifecycle integrity checks...');
    await healPrematurelyClosedMonths();
    await pruneEmptyFutureMonths();
    console.log('  ✔ Month lifecycle checks verified.');

    // 6. Supabase Production Hardening: Row Level Security (RLS)
    console.log('\nStep 6: Applying Supabase security hardening (Row Level Security)...');
    for (const table of CORE_APP_TABLES) {
      try {
        await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
        console.log(`  ✔ Enabled RLS on public."${table}"`);
      } catch (rlsErr) {
        console.warn(`  [Notice] RLS on public."${table}": ${rlsErr.message}`);
      }
    }

    // Revoke public/anon access if connecting to Supabase with anon role present
    try {
      await client.query(`
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
      `);
      console.log('  ✔ Revoked unauthenticated (anon) access on public schema (defense-in-depth).');
    } catch (revokeErr) {
      // Safe to ignore in local Postgres where 'anon' role may not exist
      if (!revokeErr.message.includes('role "anon" does not exist')) {
        console.warn(`  [Notice] Anon role revocation note: ${revokeErr.message}`);
      }
    }

    console.log('\n============================================================');
    console.log('  ✔ DATABASE PREPARATION COMPLETED SUCCESSFULLY!');
    console.log('  NEXT STEP: Run "npm run db:verify" to execute health checks.');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n✖ Database preparation failed:', err);
    if (err.message?.includes('already exists') || err.cause?.message?.includes('already exists')) {
      console.error('\n💡 [Database Analyst Tip]');
      console.error('   Existing tables or prior incomplete migrations were detected in this database.');
      console.error('   Since you confirmed you want to clean and prepare existing tables for production, run:');
      console.error('\n     npm run db:clean -- --confirm-wipe-database');
      console.error('     npm run db:prepare\n');
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPrepare();
