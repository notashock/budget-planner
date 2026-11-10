import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db, pool, runMigrations } from '../db/index.js';
import * as s from '../db/schema.js';
import { config } from '../config.js';

// Mongoose Models
import { User } from '../models/User.js';
import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Transaction } from '../models/Transaction.js';
import { Transfer } from '../models/Transfer.js';
import { Goal } from '../models/Goal.js';
import { Setting } from '../models/Setting.js';

async function migrateMongoToPostgres() {
  console.log('--- Starting MongoDB to PostgreSQL Migration ---');

  // 1. Ensure migrations are applied
  console.log('Ensuring PostgreSQL tables exist...');
  await runMigrations();

  // 2. Connect to MongoDB
  console.log(`Connecting to MongoDB at ${config.mongoUri}...`);
  await connectDB(config.mongoUri);

  // 1. Gather all documents from MongoDB first
  console.log('Fetching all collections from MongoDB...');
  const mongoUsers = await User.find({}).lean();
  const mongoBanks = await BankAccount.find({}).lean();
  const mongoWallets = await Wallet.find({}).lean();
  const mongoMonths = await Month.find({}).lean();
  const mongoItems = await Item.find({}).lean();
  const mongoTransfers = await Transfer.find({}).lean();
  const mongoTransactions = await Transaction.find({}).lean();
  const mongoGoals = await Goal.find({}).lean();
  const mongoSettings = await Setting.find({}).lean();

  const userIds = new Set(mongoUsers.map(u => String(u._id)));
  const bankIds = new Set(mongoBanks.map(b => String(b._id)));
  const walletIds = new Set(mongoWallets.map(w => String(w._id)));
  const monthIds = new Set(mongoMonths.map(m => String(m._id)));
  const itemIds = new Set(mongoItems.map(i => String(i._id)));
  const transferIds = new Set(mongoTransfers.map(t => String(t._id)));

  // Deterministic mapping from MongoDB ObjectId string to RFC4122 UUID v4
  function mongoIdToUuid(mongoId) {
    if (!mongoId) return null;
    const str = String(mongoId._id || mongoId.id || mongoId);
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }

  function getExistingUuid(idSet, mongoId) {
    if (!mongoId) return null;
    const str = String(mongoId._id || mongoId.id || mongoId);
    if (!idSet.has(str)) return null;
    return mongoIdToUuid(str);
  }

  const client = await pool.connect();
  const txDb = drizzle(client, { schema: s });
  try {
    await client.query('BEGIN');

    console.log('Truncating PostgreSQL tables for a fresh migration...');
    await client.query(`
      TRUNCATE TABLE 
        month_account_openings,
        fuel_stops,
        transactions,
        transfers,
        items,
        goals,
        months,
        wallets,
        bank_accounts,
        settings,
        users 
      CASCADE;
    `);

    // 1. Users
    console.log(`Migrating ${mongoUsers.length} users...`);
    for (const u of mongoUsers) {
      const uId = mongoIdToUuid(u._id);
      await txDb.insert(s.users).values({
        id: uId,
        username: u.username || (u.email ? u.email.split('@')[0] : 'user'),
        email: u.email,
        passwordHash: u.passwordHash,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date()
      });
    }

    // 2. Bank Accounts
    console.log(`Migrating ${mongoBanks.length} bank accounts...`);
    for (const b of mongoBanks) {
      const uId = getExistingUuid(userIds, b.userId);
      if (!uId) continue;
      const bId = mongoIdToUuid(b._id);
      await txDb.insert(s.bankAccounts).values({
        id: bId,
        userId: uId,
        name: b.name,
        institution: b.institution || '',
        accountType: b.accountType || 'checking',
        accountNumberMasked: b.accountNumberMasked || '',
        openingBalance: Number(b.openingBalance) || 0,
        minimumBalance: Number(b.minimumBalance) || 0,
        isPrimary: Boolean(b.isPrimary),
        isArchived: Boolean(b.isArchived),
        color: b.color || '#09090b',
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
      }).onConflictDoNothing();
    }

    // 3. Wallets
    console.log(`Migrating ${mongoWallets.length} wallets...`);
    for (const w of mongoWallets) {
      const uId = getExistingUuid(userIds, w.userId);
      if (!uId) continue;
      const wId = mongoIdToUuid(w._id);
      await txDb.insert(s.wallets).values({
        id: wId,
        userId: uId,
        name: w.name,
        walletType: w.walletType || 'cash',
        openingBalance: Number(w.openingBalance) || 0,
        isPrimary: Boolean(w.isPrimary),
        isArchived: Boolean(w.isArchived),
        color: w.color || '#09090b',
        createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
        updatedAt: w.updatedAt ? new Date(w.updatedAt) : new Date()
      }).onConflictDoNothing();
    }

    // 4. Months & Month Account Openings
    console.log(`Migrating ${mongoMonths.length} months...`);
    for (const m of mongoMonths) {
      const uId = getExistingUuid(userIds, m.userId);
      if (!uId) continue;
      const mId = mongoIdToUuid(m._id);
      const salaryBankId = getExistingUuid(bankIds, m.salaryBankAccountId);

      await txDb.insert(s.months).values({
        id: mId,
        userId: uId,
        year: m.year,
        month: m.month,
        openingBalance: Number(m.openingBalance) || 0,
        incomeAmount: Number(m.incomeAmount) || 0,
        incomeCreditDate: m.incomeCreditDate || null,
        incomeCreditDay: Number(m.incomeCreditDay) || 1,
        safetyFloor: Number(m.safetyFloor) || 0,
        unplannedAllowance: Number(m.unplannedAllowance) || 0,
        currencySymbol: m.currencySymbol || '₹',
        salaryBankAccountId: salaryBankId,
        isSalaryCredited: Boolean(m.isSalaryCredited),
        salaryCreditedDate: m.salaryCreditedDate || null,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date()
      }).onConflictDoNothing();

      if (Array.isArray(m.accountOpeningBalances)) {
        for (const op of m.accountOpeningBalances) {
          const isBank = (op.accountType || 'bank') === 'bank';
          const accId = isBank ? getExistingUuid(bankIds, op.accountId) : getExistingUuid(walletIds, op.accountId);
          if (accId) {
            await txDb.insert(s.monthAccountOpenings).values({
              monthId: mId,
              accountType: op.accountType || 'bank',
              accountId: accId,
              amount: Number(op.amount) || 0
            }).onConflictDoNothing();
          }
        }
      }
    }

    // 5. Items & Fuel Stops
    console.log(`Migrating ${mongoItems.length} planned items...`);
    for (const itm of mongoItems) {
      const uId = getExistingUuid(userIds, itm.userId);
      const mId = getExistingUuid(monthIds, itm.monthId);
      if (!uId || !mId) continue;
      const itmId = mongoIdToUuid(itm._id);
      const bankId = getExistingUuid(bankIds, itm.bankAccountId);
      const walletId = getExistingUuid(walletIds, itm.walletId);

      await txDb.insert(s.items).values({
        id: itmId,
        userId: uId,
        monthId: mId,
        type: itm.type || 'one-time',
        name: itm.name,
        category: itm.category || 'General',
        priority: itm.priority ?? 0,
        isFixed: Boolean(itm.isFixed),
        isIncome: Boolean(itm.isIncome),
        isPaid: Boolean(itm.isPaid),
        amount: Number(itm.amount) || 0,
        day: itm.day ?? null,
        dayOfMonth: itm.dayOfMonth ?? null,
        originalDay: itm.originalDay ?? null,
        originalDate: itm.originalDate || null,
        date: itm.date || null,
        accountType: itm.accountType || null,
        bankAccountId: bankId,
        walletId: walletId,
        createdAt: itm.createdAt ? new Date(itm.createdAt) : new Date(),
        updatedAt: itm.updatedAt ? new Date(itm.updatedAt) : new Date()
      }).onConflictDoNothing();

      if (Array.isArray(itm.fuelStops)) {
        for (const fs of itm.fuelStops) {
          await txDb.insert(s.fuelStops).values({
            itemId: itmId,
            date: fs.date,
            odometer: Number(fs.odometer) || 0,
            fuelVolume: String(fs.fuelVolume || '0'),
            fuelCost: Number(fs.fuelCost) || 0
          }).onConflictDoNothing();
        }
      }
    }

    // 6. Transfers
    console.log(`Migrating ${mongoTransfers.length} transfers...`);
    for (const tr of mongoTransfers) {
      const uId = getExistingUuid(userIds, tr.userId);
      const mId = getExistingUuid(monthIds, tr.monthId);
      if (!uId || !mId) continue;
      const trId = mongoIdToUuid(tr._id);
      const sBankId = getExistingUuid(bankIds, tr.sourceBankAccountId);
      const sWalletId = getExistingUuid(walletIds, tr.sourceWalletId);
      const dBankId = getExistingUuid(bankIds, tr.destinationBankAccountId);
      const dWalletId = getExistingUuid(walletIds, tr.destinationWalletId);

      await txDb.insert(s.transfers).values({
        id: trId,
        userId: uId,
        monthId: mId,
        date: tr.date,
        amount: Number(tr.amount) || 0,
        sourceType: tr.sourceType,
        sourceBankAccountId: sBankId,
        sourceWalletId: sWalletId,
        destinationType: tr.destinationType,
        destinationBankAccountId: dBankId,
        destinationWalletId: dWalletId,
        note: tr.note || '',
        createdAt: tr.createdAt ? new Date(tr.createdAt) : new Date(),
        updatedAt: tr.updatedAt ? new Date(tr.updatedAt) : new Date()
      }).onConflictDoNothing();
    }

    // 7. Transactions (Actuals & Credits/Refunds)
    console.log(`Migrating ${mongoTransactions.length} transactions...`);
    for (const tx of mongoTransactions) {
      const uId = getExistingUuid(userIds, tx.userId);
      const mId = getExistingUuid(monthIds, tx.monthId);
      if (!uId || !mId) continue;
      const txId = mongoIdToUuid(tx._id);
      const bankId = getExistingUuid(bankIds, tx.bankAccountId);
      const walletId = getExistingUuid(walletIds, tx.walletId);
      const pItmId = getExistingUuid(itemIds, tx.plannedItemId);
      const trId = getExistingUuid(transferIds, tx.transferId);

      await txDb.insert(s.transactions).values({
        id: txId,
        userId: uId,
        monthId: mId,
        date: tx.date,
        amount: Number(tx.amount) || 0,
        tag: tx.tag || 'Other',
        category: tx.category || 'Other',
        note: tx.note || '',
        isIncome: Boolean(tx.isIncome),
        accountType: tx.accountType || null,
        bankAccountId: bankId,
        walletId: walletId,
        plannedItemId: pItmId,
        transferId: trId,
        createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        updatedAt: tx.updatedAt ? new Date(tx.updatedAt) : new Date()
      }).onConflictDoNothing();
    }

    // 8. Goals
    console.log(`Migrating ${mongoGoals.length} purchase goals...`);
    for (const g of mongoGoals) {
      const uId = getExistingUuid(userIds, g.userId);
      const mId = getExistingUuid(monthIds, g.monthId);
      if (!uId || !mId) continue;
      const gId = mongoIdToUuid(g._id);
      const fBankId = getExistingUuid(bankIds, g.fundingBankAccountId);
      const fWalletId = getExistingUuid(walletIds, g.fundingWalletId);

      await txDb.insert(s.goals).values({
        id: gId,
        userId: uId,
        monthId: mId,
        name: g.name,
        targetAmount: Number(g.targetAmount) || 0,
        status: g.status || 'active',
        deferredReason: g.deferredReason || null,
        priority: g.priority ?? 0,
        fundingSourceType: g.fundingSourceType || null,
        fundingBankAccountId: fBankId,
        fundingWalletId: fWalletId,
        createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
        updatedAt: g.updatedAt ? new Date(g.updatedAt) : new Date()
      }).onConflictDoNothing();
    }

    // 9. Settings
    console.log(`Migrating ${mongoSettings.length} settings records...`);
    for (const st of mongoSettings) {
      const uId = getExistingUuid(userIds, st.userId);
      const salBankId = getExistingUuid(bankIds, st.defaultSalaryBankAccountId);
      if (uId) {
        await txDb.insert(s.settings).values({
          userId: uId,
          defaultIncomeAmount: Number(st.defaultIncomeAmount) || 0,
          defaultIncomeCreditDay: Number(st.defaultIncomeCreditDay) || 1,
          defaultSafetyFloor: Number(st.defaultSafetyFloor) || 0,
          defaultUnplannedAllowance: Number(st.defaultUnplannedAllowance) || 0,
          currencySymbol: st.currencySymbol || '₹',
          defaultSalaryBankAccountId: salBankId,
          aiAssistantEnabled: Boolean(st.aiAssistantEnabled),
          theme: st.theme || 'system',
          createdAt: st.createdAt ? new Date(st.createdAt) : new Date(),
          updatedAt: st.updatedAt ? new Date(st.updatedAt) : new Date()
        }).onConflictDoNothing();
      }
    }

    await client.query('COMMIT');
    console.log('--- MongoDB to PostgreSQL Migration COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back PostgreSQL transaction:', err);
    throw err;
  } finally {
    client.release();
    await disconnectDB();
    await pool.end();
  }
}

migrateMongoToPostgres().catch((err) => {
  console.error(err);
  process.exit(1);
});
