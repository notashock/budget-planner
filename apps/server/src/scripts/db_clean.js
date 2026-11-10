#!/usr/bin/env node
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// Parse CLI flags
const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm-wipe-database');
const isTruncateOnly = args.includes('--truncate-only');
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

// Known core tables in safe drop order (child -> parent)
const KNOWN_TABLES_ORDER = [
  'transactions',
  'transfers',
  'items',
  'goals',
  'month_account_openings',
  'months',
  'salary_templates',
  'settings',
  'accounts',
  'users',
  '__drizzle_migrations'
];

async function runClean() {
  console.log('\n============================================================');
  console.log('  DEVOPS DATABASE CLEAN ENGINE (SUPABASE PREPARATION)');
  console.log('============================================================');

  // Mask database credentials in output for security
  const maskedUrl = targetDbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`Target Database: ${maskedUrl}`);
  console.log(`SSL Mode:        ${isRemoteDb ? 'Enabled (rejectUnauthorized: false)' : 'Disabled (Local)'}`);
  console.log(`Action Mode:     ${isTruncateOnly ? 'TRUNCATE ALL DATA (Keep Schemas)' : 'FULL WIPE (Drop Public Tables & Constraints)'}`);
  console.log(`Execution Mode:  ${isConfirmed ? 'LIVE EXECUTION' : 'DRY RUN (Safety Shield Active)'}\n`);

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

  try {
    // 1. Audit existing tables in public schema only
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);

    const existingTables = res.rows.map((r) => r.table_name);

    console.log(`Found ${existingTables.length} table(s) in 'public' schema:`);
    if (existingTables.length === 0) {
      console.log('  [Notice] Public schema is currently empty. No tables to clean.');
      return;
    }

    existingTables.forEach((t) => {
      console.log(`  - public."${t}"`);
    });

    if (!isConfirmed) {
      console.log('\n[SAFETY NOTICE - DRY RUN ONLY]');
      console.log('No destructive actions were performed.');
      console.log('To execute this clean operation against your database, re-run with:');
      console.log('\n  npm run db:clean -- --confirm-wipe-database');
      if (isTruncateOnly) {
        console.log('  npm run db:clean -- --confirm-wipe-database --truncate-only');
      }
      console.log('\nOr specify a remote target URL:');
      console.log('  DATABASE_URL="<supabase-url>" npm run db:clean -- --confirm-wipe-database\n');
      return;
    }

    // 2. Live Execution
    console.log('\n[LIVE EXECUTION STARTED]');

    if (isTruncateOnly) {
      console.log('Truncating all tables in public schema (CASCADE)...');
      for (const table of existingTables) {
        try {
          await client.query(`TRUNCATE TABLE public."${table}" CASCADE;`);
          console.log(`  ✔ Truncated public."${table}"`);
        } catch (truncErr) {
          console.warn(`  ⚠ Could not truncate public."${table}": ${truncErr.message}`);
        }
      }
    } else {
      console.log('Dropping all tables, views, extensions, and custom types in public schema (CASCADE)...');

      // 0. Drop PostGIS / GIS extensions if present (which own spatial_ref_sys, geometry_columns, geography_columns)
      const postgisExtensions = ['postgis_tiger_geocoder', 'postgis_topology', 'postgis_raster', 'postgis'];
      for (const ext of postgisExtensions) {
        try {
          const extCheck = await client.query(`SELECT 1 FROM pg_extension WHERE extname = $1;`, [ext]);
          if (extCheck.rows.length > 0) {
            await client.query(`DROP EXTENSION IF EXISTS "${ext}" CASCADE;`);
            console.log(`  ✔ Dropped extension "${ext}" (purged spatial_ref_sys, geometry_columns, geography_columns)`);
          }
        } catch (extErr) {
          console.warn(`  ⚠ Could not drop extension "${ext}": ${extErr.message}`);
        }
      }

      // 1. Drop all views and materialized views in public schema
      try {
        const viewRes = await client.query(`
          SELECT table_name FROM information_schema.views WHERE table_schema = 'public';
        `);
        for (const v of viewRes.rows) {
          try {
            await client.query(`DROP VIEW IF EXISTS public."${v.table_name}" CASCADE;`);
            console.log(`  ✔ Dropped view public."${v.table_name}"`);
          } catch (viewErr) {
            console.warn(`  ⚠ Skipped view public."${v.table_name}": ${viewErr.message}`);
          }
        }
      } catch (e) {
        console.warn(`  ⚠ Could not query views: ${e.message}`);
      }

      // 2. Sort tables to drop known child tables first, then any extra/unknown tables
      const tablesToDrop = [
        ...KNOWN_TABLES_ORDER.filter((t) => existingTables.includes(t)),
        ...existingTables.filter((t) => !KNOWN_TABLES_ORDER.includes(t))
      ];

      for (const table of tablesToDrop) {
        try {
          await client.query(`DROP TABLE IF EXISTS public."${table}" CASCADE;`);
          console.log(`  ✔ Dropped table public."${table}"`);
        } catch (tblErr) {
          console.warn(`  ⚠ Could not drop table public."${table}": ${tblErr.message}`);
        }
      }

      // 3. Drop any custom types, enums, domains, or composite types in public schema
      try {
        const typeRes = await client.query(`
          SELECT t.typname 
          FROM pg_type t 
          JOIN pg_namespace n ON n.oid = t.typnamespace 
          WHERE n.nspname = 'public' AND t.typtype IN ('c', 'e', 'd');
        `);
        for (const tp of typeRes.rows) {
          try {
            await client.query(`DROP TYPE IF EXISTS public."${tp.typname}" CASCADE;`);
          } catch (typeErr) {
            // Safe skip
          }
        }
        // Explicitly ensure accounts type/view is purged
        await client.query(`DROP TYPE IF EXISTS public."accounts" CASCADE;`).catch(() => {});
        await client.query(`DROP VIEW IF EXISTS public."accounts" CASCADE;`).catch(() => {});
      } catch (e) {
        // Safe skip
      }
    }

    console.log('\n✔ Cleanup execution completed.');

    // 3. Post-execution verification audit
    const postRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
    `);

    console.log(`\nPost-Clean Inventory: ${postRes.rows.length} table(s) remaining in 'public' schema.`);
    if (postRes.rows.length > 0) {
      postRes.rows.forEach((r) => console.log(`  - public."${r.table_name}"`));
    } else {
      console.log('  ✔ Public schema is completely clean and ready for fresh migrations.');
    }

    console.log('\n============================================================');
    console.log('  NEXT STEP: Run "npm run db:prepare" to deploy fresh schema');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n✖ Database clean operation failed:');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runClean();
