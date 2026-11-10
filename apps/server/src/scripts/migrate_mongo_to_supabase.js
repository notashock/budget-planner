#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as s from '../db/schema.js';
import { config } from '../config.js';
import {
  syncTransferSchema,
  syncDatabaseNormalFormsAndConstraints,
  healPrematurelyClosedMonths,
  pruneEmptyFutureMonths
} from '../db/index.js';
import { migrateLedgerAndMaterializedBalances } from './migrate_ledger_and_materialized_balances.js';

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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deterministic mapping from MongoDB ObjectId string to RFC 4122 UUID v4
export function mongoIdToUuid(mongoId) {
  if (!mongoId) return null;
  const str = String(mongoId._id || mongoId.id || mongoId);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str.toLowerCase();
  }
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function getExistingUuid(idSet, mongoId) {
  if (!mongoId) return null;
  const str = String(mongoId._id || mongoId.id || mongoId);
  if (!idSet.has(str)) return null;
  return mongoIdToUuid(str);
}

// Convert monetary inputs to integer minor units (BigInt cents/paisa/rupees)
export function toBigIntAmount(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  if (isNaN(num)) return 0;
  return Math.round(num);
}

// Read documents from either JSON dump directory or live MongoDB connection
async function fetchSourceDocuments(options = {}) {
  const dumpDir = options.dumpDir;
  if (dumpDir && fs.existsSync(dumpDir)) {
    console.log(`[Source: File Dump] Loading MongoDB collections from directory: ${dumpDir}`);
    const loadJson = (filenameAliases) => {
      for (const name of filenameAliases) {
        const filePath = path.join(dumpDir, name);
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : (data.docs || [data]);
          } catch (e) {
            console.warn(`Could not parse JSON file ${filePath}: ${e.message}`);
          }
        }
      }
      return [];
    };

    return {
      sourceType: 'dump',
      users: loadJson(['users.json', 'User.json']),
      banks: loadJson(['bankaccounts.json', 'bank_accounts.json', 'BankAccount.json']),
      wallets: loadJson(['wallets.json', 'Wallet.json']),
      months: loadJson(['months.json', 'Month.json']),
      items: loadJson(['items.json', 'Item.json']),
      transfers: loadJson(['transfers.json', 'Transfer.json']),
      transactions: loadJson(['transactions.json', 'Transaction.json']),
      goals: loadJson(['goals.json', 'Goal.json']),
      settings: loadJson(['settings.json', 'Setting.json'])
    };
  }

  // Live MongoDB connection
  const mongoUri = options.mongoUri || config.mongoUri;
  console.log(`[Source: Live MongoDB] Connecting to MongoDB instance...`);
  const maskedMongo = mongoUri.replace(/:([^:@]+)@/, ':****@');
  console.log(`  Mongo URI: ${maskedMongo}`);

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }

  console.log('  ✔ Connected to MongoDB. Extracting collections...');
  const users = await User.find({}).lean();
  const banks = await BankAccount.find({}).lean();
  const wallets = await Wallet.find({}).lean();
  const months = await Month.find({}).lean();
  const items = await Item.find({}).lean();
  const transfers = await Transfer.find({}).lean();
  const transactions = await Transaction.find({}).lean();
  const goals = await Goal.find({}).lean();
  const settings = await Setting.find({}).lean();

  return {
    sourceType: 'live',
    users,
    banks,
    wallets,
    months,
    items,
    transfers,
    transactions,
    goals,
    settings
  };
}

export async function migrateMongoToSupabase(options = {}) {
  console.log('\n============================================================');
  console.log('  DATA ENGINEERING: MONGODB TO POSTGRESQL (SUPABASE) ETL');
  console.log('============================================================');

  const isDryRun = Boolean(options.dryRun);
  const targetDbUrl = options.databaseUrl || config.databaseUrl;
  const maskedPgUrl = targetDbUrl.replace(/:([^:@]+)@/, ':****@');

  console.log(`Target Database: ${maskedPgUrl}`);
  console.log(`Execution Mode:  ${isDryRun ? 'DRY-RUN (Simulate Mappings, Zero Database Writes)' : 'LIVE MIGRATION (ACID Transaction)'}\n`);

  // 1. Fetch Source Data
  let source;
  try {
    source = await fetchSourceDocuments(options);
  } catch (err) {
    console.warn(`\n[Notice] Could not connect to MongoDB source: ${err.message}`);
    console.warn('  If you do not have live MongoDB data to migrate, skipping MongoDB migration safely.');
    return { skipped: true, reason: err.message };
  }

  const { users, banks, wallets, months, items, transfers, transactions, goals, settings } = source;

  console.log('\n--- Source Collection Inventory ---');
  console.log(`  Users:          ${users.length}`);
  console.log(`  Bank Accounts:  ${banks.length}`);
  console.log(`  Wallets:        ${wallets.length}`);
  console.log(`  Months:         ${months.length}`);
  console.log(`  Items:          ${items.length}`);
  console.log(`  Transfers:      ${transfers.length}`);
  console.log(`  Transactions:   ${transactions.length}`);
  console.log(`  Goals:          ${goals.length}`);
  console.log(`  Settings:       ${settings.length}`);

  if (users.length === 0 && banks.length === 0 && transactions.length === 0) {
    console.log('\n[Notice] Source MongoDB database is empty. No documents to migrate.');
    if (source.sourceType === 'live' && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    return { skipped: true, reason: 'Empty source' };
  }

  // Build ID index Sets for fast foreign key validation
  const userIds = new Set(users.map((u) => String(u._id)));
  const bankIds = new Set(banks.map((b) => String(b._id)));
  const walletIds = new Set(wallets.map((w) => String(w._id)));
  const accountIds = new Set([...bankIds, ...walletIds]);
  const monthIds = new Set(months.map((m) => String(m._id)));
  const itemIds = new Set(items.map((i) => String(i._id)));
  const transferIds = new Set(transfers.map((t) => String(t._id)));

  // Month lookup map for item date inference
  const monthMap = new Map();
  for (const m of months) {
    monthMap.set(String(m._id), m);
  }

  // 2. Connect to PostgreSQL
  const isRemoteDb = Boolean(
    targetDbUrl && (
      targetDbUrl.includes('supabase.co') ||
      targetDbUrl.includes('supabase.com') ||
      targetDbUrl.includes('pooler.supabase.com') ||
      targetDbUrl.includes('sslmode=require') ||
      (config.isProduction && !targetDbUrl.includes('localhost') && !targetDbUrl.includes('127.0.0.1'))
    )
  );

  const pool = new Pool({
    connectionString: targetDbUrl,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();
  const txDb = drizzle(client, { schema: s });

  const metrics = {
    usersMigrated: 0,
    accountsMigrated: 0,
    monthsMigrated: 0,
    openingsMigrated: 0,
    itemsMigrated: 0,
    transfersMigrated: 0,
    transactionsMigrated: 0,
    goalsMigrated: 0,
    settingsMigrated: 0,
    salaryTemplatesCreated: 0
  };

  try {
    console.log('\nStarting PostgreSQL transaction (BEGIN)...');
    await client.query('BEGIN');

    // 1. Transform & Insert Users
    console.log(`\n[1/8] Transforming ${users.length} User documents...`);
    for (const u of users) {
      const uId = mongoIdToUuid(u._id);
      await txDb.insert(s.users).values({
        id: uId,
        email: u.email ? u.email.toLowerCase().trim() : `user_${uId.slice(0, 8)}@legacy.local`,
        passwordHash: u.passwordHash || '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5s4yC8.lH1/9jD/yD1bZc00x3q4.',
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.usersMigrated++;
    }

    // 2. Transform & Consolidate Polymorphic Accounts (BankAccounts + Wallets)
    console.log(`[2/8] Consolidating ${banks.length} BankAccounts & ${wallets.length} Wallets into unified 'accounts'...`);
    for (const b of banks) {
      const uId = getExistingUuid(userIds, b.userId);
      if (!uId) continue;
      const bId = mongoIdToUuid(b._id);
      const openingBal = toBigIntAmount(b.openingBalance);

      await txDb.insert(s.accounts).values({
        id: bId,
        userId: uId,
        name: b.name || 'Bank Account',
        type: 'bank',
        subtype: b.accountType || 'checking',
        institution: b.institution || '',
        accountNumberMasked: b.accountNumberMasked || '',
        openingBalance: openingBal,
        openingBalanceDate: b.openingBalanceDate || (b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : '2026-01-01'),
        currentBalance: openingBal, // Will be updated by running balance calculation
        minimumBalance: toBigIntAmount(b.minimumBalance),
        isPrimary: Boolean(b.isPrimary),
        isArchived: Boolean(b.isArchived),
        color: b.color || '#09090b',
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.accountsMigrated++;
    }

    for (const w of wallets) {
      const uId = getExistingUuid(userIds, w.userId);
      if (!uId) continue;
      const wId = mongoIdToUuid(w._id);
      const openingBal = toBigIntAmount(w.openingBalance);

      await txDb.insert(s.accounts).values({
        id: wId,
        userId: uId,
        name: w.name || 'Cash Wallet',
        type: 'wallet',
        subtype: w.walletType || 'cash',
        institution: '',
        accountNumberMasked: '',
        openingBalance: openingBal,
        openingBalanceDate: w.openingBalanceDate || (w.createdAt ? new Date(w.createdAt).toISOString().slice(0, 10) : '2026-01-01'),
        currentBalance: openingBal,
        minimumBalance: toBigIntAmount(w.minimumBalance),
        isPrimary: Boolean(w.isPrimary),
        isArchived: Boolean(w.isArchived),
        color: w.color || '#09090b',
        createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
        updatedAt: w.updatedAt ? new Date(w.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.accountsMigrated++;
    }

    // 3. Transform Months & Month Account Openings
    console.log(`[3/8] Transforming ${months.length} Months & normalizing account openings...`);
    for (const m of months) {
      const uId = getExistingUuid(userIds, m.userId);
      if (!uId) continue;
      const mId = mongoIdToUuid(m._id);
      const salaryAccId = getExistingUuid(accountIds, m.salaryBankAccountId);

      const year = Number(m.year);
      const month = Number(m.month);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = m.startDate || `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = m.endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      await txDb.insert(s.months).values({
        id: mId,
        userId: uId,
        year,
        month,
        startDate,
        endDate,
        openingBalance: toBigIntAmount(m.openingBalance),
        incomeAmount: toBigIntAmount(m.incomeAmount),
        incomeCreditDate: m.incomeCreditDate || null,
        safetyFloor: toBigIntAmount(m.safetyFloor),
        unplannedAllowance: toBigIntAmount(m.unplannedAllowance),
        currencySymbol: m.currencySymbol || '₹',
        salaryAccountId: salaryAccId,
        isSalaryCredited: Boolean(m.isSalaryCredited),
        salaryCreditedDate: m.salaryCreditedDate || null,
        isClosed: Boolean(m.isClosed),
        closedAt: m.closedAt ? new Date(m.closedAt) : null,
        closingBalances: m.closingBalances || null,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.monthsMigrated++;

      if (Array.isArray(m.accountOpeningBalances)) {
        for (const op of m.accountOpeningBalances) {
          const accId = getExistingUuid(accountIds, op.accountId);
          if (accId) {
            await txDb.insert(s.monthAccountOpenings).values({
              monthId: mId,
              accountId: accId,
              amount: toBigIntAmount(op.amount),
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date()
            }).onConflictDoNothing();
            metrics.openingsMigrated++;
          }
        }
      }
    }

    // 4. Transform Planned Budget Items
    console.log(`[4/8] Transforming ${items.length} Planned Items...`);
    for (const itm of items) {
      const uId = getExistingUuid(userIds, itm.userId);
      const mId = getExistingUuid(monthIds, itm.monthId);
      if (!uId || !mId) continue;
      const itmId = mongoIdToUuid(itm._id);
      const accId = getExistingUuid(accountIds, itm.bankAccountId || itm.walletId);
      const monthDoc = monthMap.get(String(itm.monthId));

      let computedDate = itm.date || itm.originalDate;
      if (!computedDate && monthDoc) {
        const day = itm.day ?? itm.dayOfMonth ?? 1;
        const safeDay = Math.min(Math.max(Math.abs(day), 1), 28);
        computedDate = `${monthDoc.year}-${String(monthDoc.month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
      }
      if (!computedDate) {
        computedDate = '2026-01-01';
      }

      await txDb.insert(s.items).values({
        id: itmId,
        userId: uId,
        monthId: mId,
        type: itm.type === 'recurring' ? 'recurring' : 'one-time',
        name: itm.name || 'Planned Item',
        category: itm.category || 'General',
        priority: Number(itm.priority) || 0,
        isFixed: Boolean(itm.isFixed),
        isIncome: Boolean(itm.isIncome),
        isPaid: Boolean(itm.isPaid),
        amount: toBigIntAmount(itm.amount),
        date: computedDate,
        accountId: accId,
        createdAt: itm.createdAt ? new Date(itm.createdAt) : new Date(),
        updatedAt: itm.updatedAt ? new Date(itm.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.itemsMigrated++;
    }

    // 5. Transform Transfers & Mirror into Transactions Ledger
    console.log(`[5/8] Transforming ${transfers.length} Transfers and synchronizing into unified ledger...`);
    const migratedTransferTxIds = new Set();
    for (const tr of transfers) {
      const uId = getExistingUuid(userIds, tr.userId);
      const mId = getExistingUuid(monthIds, tr.monthId);
      if (!uId) continue;
      const trId = mongoIdToUuid(tr._id);
      const sAccId = getExistingUuid(accountIds, tr.sourceBankAccountId || tr.sourceWalletId);
      const dAccId = getExistingUuid(accountIds, tr.destinationBankAccountId || tr.destinationWalletId);
      const amount = toBigIntAmount(tr.amount);

      await txDb.insert(s.transfers).values({
        id: trId,
        userId: uId,
        monthId: mId,
        date: tr.date || '2026-01-01',
        amount: amount,
        sourceAccountId: sAccId,
        destinationAccountId: dAccId,
        note: tr.note || '',
        createdAt: tr.createdAt ? new Date(tr.createdAt) : new Date(),
        updatedAt: tr.updatedAt ? new Date(tr.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.transfersMigrated++;

      // Create linked transaction ledger entry
      const txTransferId = mongoIdToUuid(`tx_tr_${tr._id}`);
      migratedTransferTxIds.add(String(tr._id));

      await txDb.insert(s.transactions).values({
        id: txTransferId,
        userId: uId,
        monthId: mId,
        name: 'Inter-Account Transfer',
        status: 'successful',
        origin: 'transfer',
        amount: amount,
        date: tr.date || '2026-01-01',
        category: 'Transfer',
        note: tr.note || '',
        isIncome: false,
        accountId: sAccId,
        destinationAccountId: dAccId,
        transferId: trId,
        createdAt: tr.createdAt ? new Date(tr.createdAt) : new Date(),
        updatedAt: tr.updatedAt ? new Date(tr.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.transactionsMigrated++;
    }

    // 6. Transform Transactions
    console.log(`[6/8] Transforming ${transactions.length} Actual Transactions...`);
    for (const tx of transactions) {
      const uId = getExistingUuid(userIds, tx.userId);
      if (!uId) continue;
      const txId = mongoIdToUuid(tx._id);
      const mId = getExistingUuid(monthIds, tx.monthId);
      const accId = getExistingUuid(accountIds, tx.bankAccountId || tx.walletId);
      const pItmId = getExistingUuid(itemIds, tx.plannedItemId);
      const trId = getExistingUuid(transferIds, tx.transferId);

      // Skip if already inserted as paired transfer above
      if (tx.transferId && migratedTransferTxIds.has(String(tx.transferId))) {
        continue;
      }

      const isTransfer = Boolean(tx.transferId);
      const origin = isTransfer ? 'transfer' : (pItmId ? 'planned' : 'spot');

      await txDb.insert(s.transactions).values({
        id: txId,
        userId: uId,
        monthId: mId,
        name: tx.note || tx.tag || tx.category || 'Transaction',
        status: 'successful',
        origin: origin,
        amount: toBigIntAmount(tx.amount),
        date: tx.date || '2026-01-01',
        category: tx.category || 'Other',
        note: tx.note || '',
        isIncome: Boolean(tx.isIncome),
        accountId: accId,
        plannedItemId: pItmId,
        transferId: trId,
        createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        updatedAt: tx.updatedAt ? new Date(tx.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.transactionsMigrated++;
    }

    // 7. Transform Goals
    console.log(`[7/8] Transforming ${goals.length} Purchase Goals...`);
    for (const g of goals) {
      const uId = getExistingUuid(userIds, g.userId);
      const mId = getExistingUuid(monthIds, g.monthId);
      if (!uId || !mId) continue;
      const gId = mongoIdToUuid(g._id);
      const fAccId = getExistingUuid(accountIds, g.fundingBankAccountId || g.fundingWalletId);

      let status = 'logged';
      if (g.status === 'scheduled') status = 'scheduled';
      else if (g.status === 'ready' || g.status === 'achieved') status = 'achieved';
      else if (g.status === 'dropped') status = 'dropped';

      await txDb.insert(s.goals).values({
        id: gId,
        userId: uId,
        monthId: mId,
        name: g.name || 'Purchase Goal',
        targetAmount: toBigIntAmount(g.targetAmount),
        targetDate: g.targetDate || null,
        status: status,
        deferredReason: g.deferredReason || null,
        priority: Number(g.priority) || 0,
        fundingAccountId: fAccId,
        createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
        updatedAt: g.updatedAt ? new Date(g.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.goalsMigrated++;
    }

    // 8. Transform Settings & Synthesize Salary Templates
    console.log(`[8/8] Transforming Settings & synthesizing Salary Templates...`);
    const settingUserMap = new Map();
    for (const st of settings) {
      settingUserMap.set(String(st.userId), st);
    }

    for (const u of users) {
      const uId = mongoIdToUuid(u._id);
      const st = settingUserMap.get(String(u._id));
      const defSalAccId = getExistingUuid(accountIds, st?.defaultSalaryBankAccountId);

      await txDb.insert(s.settings).values({
        userId: uId,
        incomeMode: 'salary',
        periodType: 'calendar_month',
        defaultIncomeAmount: toBigIntAmount(st?.defaultIncomeAmount),
        defaultIncomeCreditDay: Number(st?.defaultIncomeCreditDay) || 1,
        defaultSafetyFloor: toBigIntAmount(st?.defaultSafetyFloor),
        defaultUnplannedAllowance: toBigIntAmount(st?.defaultUnplannedAllowance),
        dueWindowDays: 3,
        currencySymbol: st?.currencySymbol || '₹',
        defaultSalaryAccountId: defSalAccId,
        aiAssistantEnabled: Boolean(st?.aiAssistantEnabled),
        theme: st?.theme || 'system',
        createdAt: st?.createdAt ? new Date(st.createdAt) : new Date(),
        updatedAt: st?.updatedAt ? new Date(st.updatedAt) : new Date()
      }).onConflictDoNothing();
      metrics.settingsMigrated++;

      // Auto-synthesize Salary Template if income or salary account exists
      const incomeAmt = toBigIntAmount(st?.defaultIncomeAmount);
      if (incomeAmt > 0 || defSalAccId) {
        const salTmplId = mongoIdToUuid(`sal_tmpl_${u._id}`);
        await txDb.insert(s.salaryTemplates).values({
          id: salTmplId,
          userId: uId,
          amount: incomeAmt,
          expectedCreditDay: Number(st?.defaultIncomeCreditDay) || 1,
          receivingAccountId: defSalAccId,
          periodType: 'calendar_month',
          effectiveDate: '2026-01-01',
          isActive: true,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }).onConflictDoNothing();
        metrics.salaryTemplatesCreated++;
      }
    }

    // 9. Reconcile Running Balances & Materialized Balances
    console.log('\n[Reconciliation] Materializing accurate current_balance across all accounts...');
    const balanceRes = await client.query(`
      UPDATE "accounts" a
      SET "current_balance" = a."opening_balance" + COALESCE((
        SELECT SUM(
          CASE 
            WHEN t."is_income" = true THEN t."amount"
            WHEN t."origin" = 'transfer' AND t."destination_account_id" = a."id" THEN t."amount"
            WHEN t."origin" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
            ELSE -t."amount"
          END
        )
        FROM "transactions" t
        WHERE (t."account_id" = a."id" OR t."destination_account_id" = a."id")
          AND t."status" = 'successful'
      ), 0);
    `);
    console.log(`  ✔ Materialized balance updated for ${balanceRes.rowCount} account(s).`);

    // 10. Audit Table Presentation
    console.log('\n============================================================');
    console.log('  DATA ENGINEERING MIGRATION RECONCILIATION AUDIT');
    console.log('============================================================');
    console.log(`  Entity                 Source (Mongo)     Target (PostgreSQL)`);
    console.log(`  ------------------------------------------------------------`);
    console.log(`  Users                  ${String(users.length).padEnd(19)}${metrics.usersMigrated}`);
    console.log(`  Accounts (Bank+Wallet) ${String(banks.length + wallets.length).padEnd(19)}${metrics.accountsMigrated}`);
    console.log(`  Months                 ${String(months.length).padEnd(19)}${metrics.monthsMigrated}`);
    console.log(`  Account Openings       ${String(months.reduce((acc, m) => acc + (m.accountOpeningBalances?.length || 0), 0)).padEnd(19)}${metrics.openingsMigrated}`);
    console.log(`  Planned Items          ${String(items.length).padEnd(19)}${metrics.itemsMigrated}`);
    console.log(`  Transfers              ${String(transfers.length).padEnd(19)}${metrics.transfersMigrated}`);
    console.log(`  Transactions (Ledger)  ${String(transactions.length).padEnd(19)}${metrics.transactionsMigrated}`);
    console.log(`  Purchase Goals         ${String(goals.length).padEnd(19)}${metrics.goalsMigrated}`);
    console.log(`  Settings               ${String(settings.length).padEnd(19)}${metrics.settingsMigrated}`);
    console.log(`  Salary Templates       [Synthesized]      ${metrics.salaryTemplatesCreated}`);
    console.log(`============================================================\n`);

    if (isDryRun) {
      console.log('[DRY-RUN MODE] Rolling back PostgreSQL transaction (Zero changes committed).');
      await client.query('ROLLBACK');
      console.log('✔ Rollback successful. Target database remains untouched.');
    } else {
      await client.query('COMMIT');
      console.log('✔ Transaction committed successfully. All MongoDB data migrated to Supabase!');
    }

    return {
      success: true,
      dryRun: isDryRun,
      metrics
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n✖ Migration failed. Transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
    if (source.sourceType === 'live' && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

// CLI Execution Entrypoint
const isDirectCli = process.argv[1] && (
  process.argv[1].endsWith('migrate_mongo_to_supabase.js') ||
  process.argv[1].includes('migrate_mongo_to_supabase')
);

if (isDirectCli) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npm run db:migrate-mongo [-- [options]]
  node src/scripts/migrate_mongo_to_supabase.js [options]

Options:
  --dry-run                     Run full migration inside a transaction and ROLLBACK at the end
  --mongo-uri=<uri>             Source MongoDB connection string (Atlas or local)
  --dump-dir=<path>             Path to folder containing JSON dump files (*.json or collection names)
  --database-url=<url>          Target PostgreSQL/Supabase connection string
  --help, -h                    Show this help message

Examples:
  # Dry-run test from MongoDB Atlas to Supabase
  npm run db:migrate-mongo -- --dry-run --mongo-uri="mongodb+srv://user:pass@cluster.mongodb.net/dbname"

  # Live migration from export JSON dumps folder
  npm run db:migrate-mongo -- --dump-dir="./mongo_dump"

  # Live migration against production Supabase
  npm run db:migrate-mongo -- --database-url="postgresql://postgres:pass@db.xxxx.supabase.co:5432/postgres"
`);
    process.exit(0);
  }
  const dryRun = args.includes('--dry-run');
  const mongoUriArg = args.find((a) => a.startsWith('--mongo-uri='))?.split('=')[1];
  const dbUrlArg = args.find((a) => a.startsWith('--database-url='))?.split('=')[1];
  const dumpDirArg = args.find((a) => a.startsWith('--dump-dir=') || a.startsWith('--json-dir='))?.split('=')[1];

  migrateMongoToSupabase({
    dryRun,
    mongoUri: mongoUriArg,
    databaseUrl: dbUrlArg,
    dumpDir: dumpDirArg
  })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Fatal CLI migration error:', e.message);
      process.exit(1);
    });
}
