import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Transaction } from '../models/Transaction.js';
import { Goal } from '../models/Goal.js';
import { Setting } from '../models/Setting.js';

// In-flight promise map by userId to prevent race conditions during concurrent requests
const inFlightMigrations = new Map();

/**
 * Checks whether the user is eligible for legacy multi-account migration
 * and returns summary statistics for the consent modal preview.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<{ eligible: boolean, stats?: object }>}
 */
export async function getMigrationStatus(userId) {
  if (!userId) return { eligible: false };

  // 1. Strict Transition Gate: user must have 0 BankAccounts and 0 Wallets
  const bankCount = await BankAccount.countDocuments({ userId });
  if (bankCount > 0) return { eligible: false };

  const walletCount = await Wallet.countDocuments({ userId });
  if (walletCount > 0) return { eligible: false };

  // 2. Check if user has legacy data
  const months = await Month.find({ userId }).sort({ year: 1, month: 1 });
  const itemCount = await Item.countDocuments({ userId });
  const txCount = await Transaction.countDocuments({ userId });
  const goalCount = await Goal.countDocuments({ userId });

  if (months.length === 0 && itemCount === 0 && txCount === 0 && goalCount === 0) {
    // Fresh user: no legacy records to migrate
    return { eligible: false };
  }

  const latestMonth = months.length > 0 ? months[months.length - 1] : null;

  return {
    eligible: true,
    stats: {
      monthCount: months.length,
      itemCount,
      transactionCount: txCount,
      goalCount,
      currentOpeningBalance: latestMonth?.openingBalance || 0,
      currentIncomeAmount: latestMonth?.incomeAmount || 0,
      incomeCreditDate: latestMonth?.incomeCreditDate || null,
      incomeCreditDay: latestMonth?.incomeCreditDay || 1
    }
  };
}

/**
 * Executes user-consented migration to a newly configured primary bank account,
 * atomically backfilling historical months, items, transactions, and goals.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} accountDetails
 * @returns {Promise<{ bankAccount: BankAccount, stats: object }>}
 */
export async function executeMigration(userId, accountDetails = {}) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const key = userId.toString();
  if (inFlightMigrations.has(key)) {
    return inFlightMigrations.get(key);
  }

  const migrationPromise = (async () => {
    // 1. Strict Transition Gate check
    const existingBank = await BankAccount.findOne({ userId });
    if (existingBank) {
      const error = new Error('User already has a bank account configured.');
      error.statusCode = 400;
      throw error;
    }

    const existingWallet = await Wallet.findOne({ userId });
    if (existingWallet) {
      const error = new Error('User already has a wallet configured.');
      error.statusCode = 400;
      throw error;
    }

    // 2. Fetch user's months
    const months = await Month.find({ userId }).sort({ year: 1, month: 1 });
    const latestMonth = months.length > 0 ? months[months.length - 1] : null;
    const baseOpeningBalance = latestMonth?.openingBalance || 0;

    // 3. Clean and format account number
    const rawLast4 = String(accountDetails.accountNumberLast4 || accountDetails.accountNumberMasked || '').replace(/\D/g, '').slice(-4);
    const accountNumberMasked = rawLast4 ? `•••• ${rawLast4}` : (accountDetails.accountNumberMasked || '');

    const validTypes = ['checking', 'salary', 'savings', 'other'];
    const resolvedType = validTypes.includes(accountDetails.accountType)
      ? accountDetails.accountType
      : 'checking';

    // 4. Create user-consented Primary Bank Account
    const primaryBank = await BankAccount.create({
      userId,
      name: accountDetails.name?.trim() || 'Primary Checking',
      institution: accountDetails.institution?.trim() || '',
      accountType: resolvedType,
      accountNumberMasked,
      isPrimary: true,
      openingBalance: baseOpeningBalance,
      minimumBalance: Number(accountDetails.minimumBalance) || 0
    });

    // 5. Backfill Months
    for (const m of months) {
      let changed = false;
      if (!m.salaryBankAccountId) {
        m.salaryBankAccountId = primaryBank._id;
        changed = true;
      }
      if (!m.accountOpeningBalances || m.accountOpeningBalances.length === 0) {
        m.accountOpeningBalances = [
          {
            accountType: 'bank',
            accountId: primaryBank._id,
            amount: m.openingBalance || 0
          }
        ];
        changed = true;
      }
      if (changed) {
        await m.save();
      }
    }

    // 6. Backfill Items
    const itemsRes = await Item.updateMany(
      {
        userId,
        $or: [
          { accountType: null },
          { accountType: { $exists: false } },
          { bankAccountId: null, walletId: null }
        ]
      },
      {
        $set: {
          accountType: 'bank',
          bankAccountId: primaryBank._id
        }
      }
    );

    // 7. Backfill Transactions
    const txRes = await Transaction.updateMany(
      {
        userId,
        $or: [
          { accountType: null },
          { accountType: { $exists: false } },
          { bankAccountId: null, walletId: null }
        ]
      },
      {
        $set: {
          accountType: 'bank',
          bankAccountId: primaryBank._id
        }
      }
    );

    // 8. Backfill Goals
    await Goal.updateMany(
      {
        userId,
        $or: [
          { fundingSourceType: null },
          { fundingSourceType: { $exists: false } }
        ]
      },
      {
        $set: {
          fundingSourceType: 'bank',
          fundingBankAccountId: primaryBank._id
        }
      }
    );

    // 8. Update User Settings with Default Salary Depository
    await Setting.updateOne(
      { userId },
      { $set: { defaultSalaryBankAccountId: primaryBank._id } }
    );

    return {
      bankAccount: primaryBank,
      stats: {
        monthsUpdated: months.length,
        itemsUpdated: itemsRes.modifiedCount || 0,
        transactionsUpdated: txRes.modifiedCount || 0
      }
    };
  })();

  inFlightMigrations.set(key, migrationPromise);
  try {
    return await migrationPromise;
  } finally {
    inFlightMigrations.delete(key);
  }
}

/**
 * Idempotently backfills unassigned transactions (and items) for a user to a target primary bank account.
 * Per ADR 0034:
 * 1. If a transaction has a plannedItemId that points to an Item with an account assigned, inherit that item's account.
 * 2. Otherwise, assign to primaryBank._id with accountType: 'bank'.
 * 3. Also backfills any unassigned planned Items to primaryBank._id.
 * 4. Ensures any Month records link salaryBankAccountId and accountOpeningBalances if unconfigured.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} [targetBank]
 * @returns {Promise<{ modifiedCount: number }>}
 */
export async function backfillUnassignedTransactions(userId, targetBank = null) {
  if (!userId) return { modifiedCount: 0 };

  let primaryBank = targetBank;
  if (!primaryBank || !primaryBank.isPrimary) {
    const foundPrimary = await BankAccount.findOne({
      userId,
      isPrimary: true,
      isArchived: { $ne: true }
    });
    if (foundPrimary) primaryBank = foundPrimary;
    else if (!primaryBank) {
      primaryBank = await BankAccount.findOne({
        userId,
        isArchived: { $ne: true }
      }).sort({ isPrimary: -1, createdAt: 1 });
    }
  }

  if (!primaryBank) {
    return { modifiedCount: 0 };
  }

  const [activeBanks, activeWallets] = await Promise.all([
    BankAccount.find({ userId, isArchived: { $ne: true } }),
    Wallet.find({ userId, isArchived: { $ne: true } })
  ]);
  const validBankIds = activeBanks.map((b) => b._id);
  const validWalletIds = activeWallets.map((w) => w._id);

  // 1. Find all unassigned or unlinked transactions for this user
  const unassignedTxs = await Transaction.find({
    userId,
    $or: [
      { accountType: null },
      { accountType: { $exists: false } },
      { accountType: 'unassigned' },
      { bankAccountId: null, walletId: null },
      { bankAccountId: { $exists: false }, walletId: { $exists: false } },
      { bankAccountId: { $nin: validBankIds }, walletId: { $nin: validWalletIds } }
    ]
  });

  let updatedCount = 0;

  for (const tx of unassignedTxs) {
    let assignedAccountType = 'bank';
    let assignedBankAccountId = primaryBank._id;
    let assignedWalletId = null;

    if (tx.plannedItemId) {
      const item = await Item.findOne({ _id: tx.plannedItemId, userId });
      if (item && item.accountType && item.accountType !== 'unassigned') {
        if (item.accountType === 'wallet' && item.walletId && validWalletIds.some(id => String(id) === String(item.walletId))) {
          assignedAccountType = 'wallet';
          assignedWalletId = item.walletId;
          assignedBankAccountId = null;
        } else if (item.bankAccountId && validBankIds.some(id => String(id) === String(item.bankAccountId))) {
          assignedAccountType = 'bank';
          assignedBankAccountId = item.bankAccountId;
          assignedWalletId = null;
        }
      }
    }

    tx.accountType = assignedAccountType;
    tx.bankAccountId = assignedBankAccountId;
    tx.walletId = assignedWalletId;
    await tx.save();
    updatedCount++;
  }

  // 2. Also backfill any unassigned items
  await Item.updateMany(
    {
      userId,
      $or: [
        { accountType: null },
        { accountType: { $exists: false } },
        { accountType: 'unassigned' },
        { bankAccountId: null, walletId: null },
        { bankAccountId: { $exists: false }, walletId: { $exists: false } },
        { bankAccountId: { $nin: validBankIds }, walletId: { $nin: validWalletIds } }
      ]
    },
    {
      $set: {
        accountType: 'bank',
        bankAccountId: primaryBank._id
      }
    }
  );

  // 3. Ensure user's months have salaryBankAccountId and accountOpeningBalances
  const userMonths = await Month.find({ userId });
  for (const m of userMonths) {
    let changed = false;
    if (!m.salaryBankAccountId) {
      m.salaryBankAccountId = primaryBank._id;
      changed = true;
    }
    if (!m.accountOpeningBalances || m.accountOpeningBalances.length === 0) {
      m.accountOpeningBalances = [
        {
          accountType: 'bank',
          accountId: primaryBank._id,
          amount: m.openingBalance || 0
        }
      ];
      changed = true;
    }
    if (changed) {
      await m.save();
    }
  }

  return { modifiedCount: updatedCount };
}

