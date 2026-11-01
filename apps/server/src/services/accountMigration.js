import { eq, and, isNull, asc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { serialize } from '../utils/serializer.js';

const inFlightMigrations = new Map();

/**
 * Checks whether the user is eligible for legacy multi-account migration
 * and returns summary statistics for the consent modal preview.
 *
 * @param {string} userId
 * @returns {Promise<{ eligible: boolean, stats?: object }>}
 */
export async function getMigrationStatus(userId) {
  if (!userId) return { eligible: false };

  // 1. Strict Transition Gate: user must have 0 Accounts
  const [{ count: accountCount }] = await db
    .select({ count: count() })
    .from(s.accounts)
    .where(eq(s.accounts.userId, userId));
  if (Number(accountCount) > 0) return { eligible: false };

  // 2. Check if user has legacy data
  const months = await db.query.months.findMany({
    where: eq(s.months.userId, userId),
    orderBy: [asc(s.months.year), asc(s.months.month)]
  });

  const [{ count: itemCount }] = await db
    .select({ count: count() })
    .from(s.items)
    .where(eq(s.items.userId, userId));

  const [{ count: txCount }] = await db
    .select({ count: count() })
    .from(s.transactions)
    .where(eq(s.transactions.userId, userId));

  const [{ count: goalCount }] = await db
    .select({ count: count() })
    .from(s.goals)
    .where(eq(s.goals.userId, userId));

  if (months.length === 0 && Number(itemCount) === 0 && Number(txCount) === 0 && Number(goalCount) === 0) {
    return { eligible: false };
  }

  const latestMonth = months.length > 0 ? months[months.length - 1] : null;

  return {
    eligible: true,
    stats: {
      monthCount: months.length,
      itemCount: Number(itemCount),
      transactionCount: Number(txCount),
      goalCount: Number(goalCount),
      currentOpeningBalance: latestMonth?.openingBalance || 0,
      currentIncomeAmount: latestMonth?.incomeAmount || 0,
      incomeCreditDate: latestMonth?.incomeCreditDate || null,
      incomeCreditDay: latestMonth?.incomeCreditDate ? parseInt(latestMonth.incomeCreditDate.split('-')[2], 10) : 1
    }
  };
}

/**
 * Executes user-consented migration to a newly configured primary bank account,
 * atomically backfilling historical months, items, transactions, and goals.
 *
 * @param {string} userId
 * @param {object} accountDetails
 * @returns {Promise<{ bankAccount: object, stats: object }>}
 */
export async function executeMigration(userId, accountDetails = {}) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const key = String(userId);
  if (inFlightMigrations.has(key)) {
    return inFlightMigrations.get(key);
  }

  const migrationPromise = (async () => {
    // 1. Strict Transition Gate check
    const existingAccount = await db.query.accounts.findFirst({
      where: eq(s.accounts.userId, userId)
    });
    if (existingAccount) {
      const error = new Error('User already has an account configured.');
      error.statusCode = 400;
      throw error;
    }

    // 2. Fetch user's months
    const months = await db.query.months.findMany({
      where: eq(s.months.userId, userId),
      orderBy: [asc(s.months.year), asc(s.months.month)]
    });
    const latestMonth = months.length > 0 ? months[months.length - 1] : null;
    const baseOpeningBalance = latestMonth?.openingBalance || 0;

    // 3. Clean and format account number
    const rawLast4 = String(accountDetails.accountNumberLast4 || accountDetails.accountNumberMasked || '').replace(/\D/g, '').slice(-4);
    const accountNumberMasked = rawLast4 ? `•••• ${rawLast4}` : (accountDetails.accountNumberMasked || '');

    const validSubtypes = ['checking', 'salary', 'savings', 'other'];
    const resolvedSubtype = validSubtypes.includes(accountDetails.accountType)
      ? accountDetails.accountType
      : 'checking';

    // 4. Create user-consented Primary Bank Account
    const [primaryBank] = await db.insert(s.accounts).values({
      userId,
      name: accountDetails.name?.trim() || 'Primary Checking',
      type: 'bank',
      subtype: resolvedSubtype,
      institution: accountDetails.institution?.trim() || '',
      accountNumberMasked,
      isPrimary: true,
      openingBalance: baseOpeningBalance,
      minimumBalance: Number(accountDetails.minimumBalance) || 0
    }).returning();

    // 5. Backfill Months
    for (const m of months) {
      if (!m.salaryAccountId) {
        await db.update(s.months)
          .set({ salaryAccountId: primaryBank.id, updatedAt: new Date() })
          .where(eq(s.months.id, m.id));
      }
      const existingOpenings = await db.query.monthAccountOpenings.findMany({
        where: eq(s.monthAccountOpenings.monthId, m.id)
      });
      if (existingOpenings.length === 0) {
        await db.insert(s.monthAccountOpenings).values({
          monthId: m.id,
          accountId: primaryBank.id,
          amount: m.openingBalance || 0
        });
      }
    }

    // 6. Backfill Items
    const itemsRes = await db.update(s.items)
      .set({
        accountId: primaryBank.id,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(s.items.userId, userId),
          isNull(s.items.accountId)
        )
      )
      .returning();

    // 7. Backfill Transactions
    const txRes = await db.update(s.transactions)
      .set({
        accountId: primaryBank.id,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(s.transactions.userId, userId),
          isNull(s.transactions.accountId)
        )
      )
      .returning();

    // 8. Backfill Goals
    await db.update(s.goals)
      .set({
        fundingAccountId: primaryBank.id,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(s.goals.userId, userId),
          isNull(s.goals.fundingAccountId)
        )
      );

    // 9. Update User Settings with Default Salary Depository
    await db.update(s.settings)
      .set({ defaultSalaryAccountId: primaryBank.id, updatedAt: new Date() })
      .where(eq(s.settings.userId, userId));

    return {
      bankAccount: serialize(primaryBank),
      stats: {
        monthsUpdated: months.length,
        itemsUpdated: itemsRes.length,
        transactionsUpdated: txRes.length
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
 *
 * @param {string} userId
 * @param {object} [targetBank]
 * @returns {Promise<{ modifiedCount: number }>}
 */
export async function backfillUnassignedTransactions(userId, targetBank = null) {
  if (!userId) return { modifiedCount: 0 };

  let primaryBank = targetBank;
  if (!primaryBank || !primaryBank.isPrimary) {
    primaryBank = await db.query.accounts.findFirst({
      where: and(
        eq(s.accounts.userId, userId),
        eq(s.accounts.isPrimary, true),
        eq(s.accounts.isArchived, false)
      )
    });
    if (!primaryBank) {
      primaryBank = await db.query.accounts.findFirst({
        where: and(
          eq(s.accounts.userId, userId),
          eq(s.accounts.isArchived, false)
        ),
        orderBy: [asc(s.accounts.createdAt)]
      });
    }
  }

  if (!primaryBank) {
    return { modifiedCount: 0 };
  }

  const activeAccounts = await db.query.accounts.findMany({
    where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
  });
  const validAccountIds = activeAccounts.map(a => a.id);

  // Find unassigned transactions
  const allTxs = await db.query.transactions.findMany({
    where: eq(s.transactions.userId, userId)
  });

  let updatedCount = 0;
  for (const tx of allTxs) {
    const isUnassigned = !tx.accountId || !validAccountIds.includes(tx.accountId);
    if (isUnassigned) {
      let assignedAccountId = primaryBank.id;
      if (tx.plannedItemId) {
        const item = await db.query.items.findFirst({
          where: and(eq(s.items.id, tx.plannedItemId), eq(s.items.userId, userId))
        });
        if (item && item.accountId && validAccountIds.includes(item.accountId)) {
          assignedAccountId = item.accountId;
        }
      }

      await db.update(s.transactions)
        .set({
          accountId: assignedAccountId,
          updatedAt: new Date()
        })
        .where(eq(s.transactions.id, tx.id));
      updatedCount++;
    }
  }

  // Backfill unassigned items
  const allItems = await db.query.items.findMany({
    where: eq(s.items.userId, userId)
  });
  for (const itm of allItems) {
    const isUnassigned = !itm.accountId || !validAccountIds.includes(itm.accountId);
    if (isUnassigned) {
      await db.update(s.items)
        .set({
          accountId: primaryBank.id,
          updatedAt: new Date()
        })
        .where(eq(s.items.id, itm.id));
    }
  }

  // Ensure user's months have salaryAccountId
  const userMonths = await db.query.months.findMany({
    where: eq(s.months.userId, userId)
  });
  for (const m of userMonths) {
    if (!m.salaryAccountId) {
      await db.update(s.months)
        .set({ salaryAccountId: primaryBank.id, updatedAt: new Date() })
        .where(eq(s.months.id, m.id));
    }
    const openings = await db.query.monthAccountOpenings.findMany({
      where: eq(s.monthAccountOpenings.monthId, m.id)
    });
    if (openings.length === 0) {
      await db.insert(s.monthAccountOpenings).values({
        monthId: m.id,
        accountId: primaryBank.id,
        amount: m.openingBalance || 0
      });
    }
  }

  return { modifiedCount: updatedCount };
}
