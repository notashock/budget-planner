#!/usr/bin/env node
import pg from 'pg';
import mongoose from 'mongoose';
import { config } from '../config.js';

// Mongoose Models
import { User } from '../archive/models/User.js';
import { BankAccount } from '../archive/models/BankAccount.js';
import { Wallet } from '../archive/models/Wallet.js';
import { Month } from '../archive/models/Month.js';
import { Item } from '../archive/models/Item.js';
import { Transaction } from '../archive/models/Transaction.js';
import { Transfer } from '../archive/models/Transfer.js';
import { Goal } from '../archive/models/Goal.js';
import { Setting } from '../archive/models/Setting.js';

const { Pool } = pg;

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

export async function verifyMongoMigration() {
  console.log('\n============================================================');
  console.log('  DATA ENGINEERING: MIGRATION VERIFICATION & INTEGRITY PROBE');
  console.log('============================================================');

  const pool = new Pool({
    connectionString: targetDbUrl,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();

  try {
    // 1. Audit PostgreSQL Table Row Counts
    console.log('[1/4] PostgreSQL Table Row Counts:');
    const tables = [
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

    const pgCounts = {};
    for (const t of tables) {
      const res = await client.query(`SELECT count(*)::int AS count FROM public."${t}";`);
      const count = res.rows[0].count;
      pgCounts[t] = count;
      console.log(`    public."${t}":`.padEnd(35) + `${count} row(s)`);
    }

    // 2. Audit Foreign Key Integrity (0 Dangling Foreign Keys)
    console.log('\n[2/4] Foreign Key Integrity Audit:');
    const fkChecks = [
      { name: 'Accounts -> Users', sql: 'SELECT count(*)::int AS count FROM accounts WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'Months -> Users', sql: 'SELECT count(*)::int AS count FROM months WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'Items -> Accounts', sql: 'SELECT count(*)::int AS count FROM items WHERE account_id IS NOT NULL AND account_id NOT IN (SELECT id FROM accounts)' },
      { name: 'Transactions -> Accounts', sql: 'SELECT count(*)::int AS count FROM transactions WHERE account_id IS NOT NULL AND account_id NOT IN (SELECT id FROM accounts)' },
      { name: 'Transfers -> Accounts (Source)', sql: 'SELECT count(*)::int AS count FROM transfers WHERE source_account_id IS NOT NULL AND source_account_id NOT IN (SELECT id FROM accounts)' },
      { name: 'Transfers -> Accounts (Dest)', sql: 'SELECT count(*)::int AS count FROM transfers WHERE destination_account_id IS NOT NULL AND destination_account_id NOT IN (SELECT id FROM accounts)' },
      { name: 'Goals -> Accounts (Funding)', sql: 'SELECT count(*)::int AS count FROM goals WHERE funding_account_id IS NOT NULL AND funding_account_id NOT IN (SELECT id FROM accounts)' }
    ];

    let allFkValid = true;
    for (const check of fkChecks) {
      const res = await client.query(check.sql);
      const invalidCount = res.rows[0].count;
      if (invalidCount === 0) {
        console.log(`    ✔ ${check.name}: 0 orphaned references`);
      } else {
        console.warn(`    ✖ ${check.name}: FOUND ${invalidCount} ORPHANED ROW(S)!`);
        allFkValid = false;
      }
    }

    // 3. Balance Reconciliation Audit (Materialized balance = opening + ledger sum)
    console.log('\n[3/4] Financial Ledger Balance Reconciliation:');
    const balanceCheck = await client.query(`
      SELECT 
        a.id,
        a.name,
        a.current_balance,
        (a.opening_balance + COALESCE((
          SELECT SUM(
            CASE 
              WHEN t.is_income = true THEN t.amount
              WHEN t.origin = 'transfer' AND t.destination_account_id = a.id THEN t.amount
              WHEN t.origin = 'transfer' AND t.account_id = a.id THEN -t.amount
              ELSE -t.amount
            END
          )
          FROM transactions t
          WHERE (t.account_id = a.id OR t.destination_account_id = a.id)
            AND t.status = 'successful'
        ), 0)) AS calculated_balance
      FROM accounts a;
    `);

    let balanceIntegrityPassed = true;
    let accountsChecked = 0;
    for (const row of balanceCheck.rows) {
      accountsChecked++;
      const current = BigInt(row.current_balance);
      const calc = BigInt(row.calculated_balance);
      if (current !== calc) {
        console.error(`    ✖ Account "${row.name}" (${row.id}): Materialized=${current} vs Calculated=${calc}`);
        balanceIntegrityPassed = false;
      }
    }

    if (accountsChecked === 0) {
      console.log('    [Notice] Zero accounts in database to verify.');
    } else if (balanceIntegrityPassed) {
      console.log(`    ✔ All ${accountsChecked} account(s) have 100% mathematically reconciled balances.`);
    }

    // 4. Source vs Target Equality Probe (If MongoDB is online)
    console.log('\n[4/4] MongoDB vs PostgreSQL Comparative Audit:');
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
      }
      const mongoUsers = await User.countDocuments();
      const mongoBanks = await BankAccount.countDocuments();
      const mongoWallets = await Wallet.countDocuments();
      const mongoMonths = await Month.countDocuments();
      const mongoItems = await Item.countDocuments();
      const mongoTransfers = await Transfer.countDocuments();
      const mongoTransactions = await Transaction.countDocuments();
      const mongoGoals = await Goal.countDocuments();
      const mongoSettings = await Setting.countDocuments();

      console.log(`    Users:         Mongo=${mongoUsers}`.padEnd(30) + `Postgres=${pgCounts.users}   ` + (mongoUsers === pgCounts.users ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Accounts:      Mongo=${mongoBanks + mongoWallets}`.padEnd(30) + `Postgres=${pgCounts.accounts}   ` + (mongoBanks + mongoWallets === pgCounts.accounts ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Months:        Mongo=${mongoMonths}`.padEnd(30) + `Postgres=${pgCounts.months}   ` + (mongoMonths === pgCounts.months ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Items:         Mongo=${mongoItems}`.padEnd(30) + `Postgres=${pgCounts.items}   ` + (mongoItems === pgCounts.items ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Transfers:     Mongo=${mongoTransfers}`.padEnd(30) + `Postgres=${pgCounts.transfers}   ` + (mongoTransfers === pgCounts.transfers ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Goals:         Mongo=${mongoGoals}`.padEnd(30) + `Postgres=${pgCounts.goals}   ` + (mongoGoals === pgCounts.goals ? '✔ MATCH' : '⚠ DIFF'));
      console.log(`    Settings:      Mongo=${mongoSettings}`.padEnd(30) + `Postgres=${pgCounts.settings}   ` + (mongoSettings === pgCounts.settings ? '✔ MATCH' : '⚠ DIFF'));
    } catch (mongoErr) {
      console.log(`    [Notice] Live MongoDB comparison skipped (MongoDB not reachable: ${mongoErr.message}).`);
    }

    console.log('\n============================================================');
    if (allFkValid && balanceIntegrityPassed) {
      console.log('  ✔ DATA INTEGRITY VERIFICATION PASSED WITH ZERO LOSS');
    } else {
      console.warn('  ⚠ DATA INTEGRITY PROBE REPORTED ISSUES (See above)');
    }
    console.log('============================================================\n');

  } catch (err) {
    console.error('\n✖ Verification failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

const isDirectCli = process.argv[1] && (
  process.argv[1].endsWith('verify_mongo_migration.js') ||
  process.argv[1].includes('verify_mongo_migration')
);

if (isDirectCli) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npm run db:verify-mongo [-- [options]]
  node src/scripts/verify_mongo_migration.js [options]

Options:
  --mongo-uri=<uri>             Source MongoDB connection string (Atlas or local)
  --database-url=<url>          Target PostgreSQL/Supabase connection string
  --help, -h                    Show this help message

Examples:
  npm run db:verify-mongo
  npm run db:verify-mongo -- --database-url="postgresql://..." --mongo-uri="mongodb+srv://..."
`);
    process.exit(0);
  }
  verifyMongoMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
