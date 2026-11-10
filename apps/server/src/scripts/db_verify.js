#!/usr/bin/env node
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

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

const EXPECTED_TABLES = [
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

const CRITICAL_INDEXES = [
  'uq_user_primary_bank',
  'uq_openings_month_account',
  'idx_transactions_account_date',
  'idx_transactions_month_origin_status'
];

async function runVerify() {
  console.log('\n============================================================');
  console.log('  DEVOPS DATABASE VERIFICATION & HEALTH PROBE');
  console.log('============================================================');

  const maskedUrl = targetDbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`Target Database: ${maskedUrl}`);
  console.log(`SSL Mode:        ${isRemoteDb ? 'Enabled (rejectUnauthorized: false)' : 'Disabled (Local)'}\n`);

  const startTime = Date.now();
  const pool = new Pool({
    connectionString: targetDbUrl,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  });

  let client;
  try {
    client = await pool.connect();
    const connectTime = Date.now() - startTime;
    console.log(`[1] Connection & TLS Handshake: ✔ Connected in ${connectTime}ms`);

    // Version Check
    const verRes = await client.query('SELECT version();');
    const fullVer = verRes.rows[0].version;
    const shortVer = fullVer.split(' on ')[0];
    console.log(`    PostgreSQL Version: ${shortVer}`);

    // Table Inventory Check
    console.log('\n[2] Application Table Inventory:');
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
    `);
    const existingTables = tableRes.rows.map((r) => r.table_name);

    let allTablesPresent = true;
    for (const table of EXPECTED_TABLES) {
      const exists = existingTables.includes(table);
      if (exists) {
        console.log(`    ✔ public."${table}" exists`);
      } else {
        console.log(`    ✖ public."${table}" MISSING!`);
        allTablesPresent = false;
      }
    }

    // Critical Indexes Check
    console.log('\n[3] Domain Indexes & Integrity Constraints:');
    const idxRes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);
    const existingIndexes = idxRes.rows.map((r) => r.indexname);

    for (const idx of CRITICAL_INDEXES) {
      const exists = existingIndexes.includes(idx);
      if (exists) {
        console.log(`    ✔ Index "${idx}" active`);
      } else {
        console.log(`    ✖ Index "${idx}" NOT FOUND!`);
      }
    }

    // Row Level Security (RLS) Check
    console.log('\n[4] Supabase Security & RLS Status:');
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = ANY($1);
    `, [EXPECTED_TABLES]);

    rlsRes.rows.forEach((r) => {
      const statusIcon = r.rowsecurity ? '✔ RLS Enabled' : '⚠ RLS Disabled';
      console.log(`    ${statusIcon} on public."${r.tablename}"`);
    });

    // ACID Transaction Smoke Test
    console.log('\n[5] ACID Transaction Capability Smoke Test:');
    await client.query('BEGIN');
    const uuidRes = await client.query('SELECT gen_random_uuid() AS uuid;');
    if (uuidRes.rows[0]?.uuid) {
      console.log(`    ✔ Generated test UUID: ${uuidRes.rows[0].uuid}`);
    }
    await client.query('ROLLBACK');
    console.log('    ✔ Transaction ROLLBACK confirmed successful.');

    console.log('\n============================================================');
    if (allTablesPresent) {
      console.log('  ✔ DATABASE HEALTH CHECK: PASSED (10/10 Tables Ready)');
      console.log('  The database is fully configured and ready for production!');
    } else {
      console.log('  ✖ DATABASE HEALTH CHECK: INCOMPLETE');
      console.log('  Run "npm run db:prepare" to deploy missing tables.');
    }
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n✖ Database verification failed:', err.message);
    if (err.code === 'EACCES' || err.message?.includes('connect')) {
      console.error('  Could not reach PostgreSQL server at the specified host and port.');
      console.error('  Please check your DATABASE_URL, network reachability, and ensure credentials are correct.');
    }
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runVerify();
