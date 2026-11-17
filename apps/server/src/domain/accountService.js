import { eq, and, desc, asc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';
import { LedgerService } from './ledgerService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';

const ACCOUNT_TYPES = ['bank', 'wallet', 'cash'];
const BANK_SUBTYPES = ['checking', 'savings', 'salary', 'cash', 'other'];
const WALLET_SUBTYPES = ['cash', 'digital', 'other'];

/**
 * Parses a money value (number or string such as "₹1,200") into whole paise.
 * Returns undefined when the value is absent so callers can tell "not sent" from 0.
 */
export function parseCurrencyInt(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = Number(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

function resolveType({ type, accountType }, defaultType) {
  if (type === 'cash' || accountType === 'cash') return 'cash';
  if (ACCOUNT_TYPES.includes(type)) return type;
  return defaultType;
}

function resolveSubtype(type, body) {
  if (type === 'wallet') {
    const wanted = body.walletType ?? body.subtype;
    return WALLET_SUBTYPES.includes(wanted) ? wanted : 'cash';
  }
  const wanted = body.accountType ?? body.subtype;
  if (BANK_SUBTYPES.includes(wanted)) return wanted;
  return type === 'cash' ? 'cash' : 'checking';
}

function resolveUpdatedSubtype(type, body) {
  if (type === 'wallet') {
    const wanted = body.walletType ?? body.subtype;
    return WALLET_SUBTYPES.includes(wanted) ? wanted : undefined;
  }
  const wanted = body.accountType ?? body.subtype;
  return ['checking', 'savings', 'salary', 'other'].includes(wanted) ? wanted : undefined;
}

async function findOwnedAccount(userId, accountId, expectedType, notFoundMessage) {
  if (!accountId || accountId === 'undefined' || accountId === 'null') {
    throw new ValidationError('Invalid account ID');
  }
  const conditions = [eq(s.accounts.id, accountId), eq(s.accounts.userId, userId)];
  if (expectedType) conditions.push(eq(s.accounts.type, expectedType));
  const account = await db.query.accounts.findFirst({ where: and(...conditions) });
  if (!account) throw new NotFoundError(notFoundMessage);
  return account;
}

async function demotePrimary(userId, type) {
  await db.update(s.accounts)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, type)));
}

/**
 * Account lifecycle shared by the legacy /api/bank-accounts and /api/wallets
 * routers and by /api/v1/accounts, so both surfaces behave identically.
 */
export const AccountService = {
  /** Lists accounts, primary first. `type` narrows to bank / wallet / cash. */
  async listAccounts(userId, { type = null, includeArchived = false } = {}) {
    const conditions = [eq(s.accounts.userId, userId)];
    if (type) conditions.push(eq(s.accounts.type, type));
    if (!includeArchived) conditions.push(eq(s.accounts.isArchived, false));

    const rows = await db.query.accounts.findMany({
      where: and(...conditions),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });
    return serialize(rows);
  },

  /**
   * Creates an account. Marking it primary demotes the previous primary of the
   * same type. The first active bank account becomes primary automatically, and
   * a new primary bank account adopts transactions that have no account yet.
   */
  async createAccount(userId, body = {}, { defaultType = 'bank', nameLabel = 'Account' } = {}) {
    const { name, institution, accountNumberMasked, openingBalanceDate, color } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError(`${nameLabel} name is required`);
    }

    const type = resolveType(body, defaultType);
    const isPrimary = Boolean(body.isPrimary);
    if (isPrimary) await demotePrimary(userId, type);

    const openingBalance = parseCurrencyInt(body.openingBalance) ?? 0;
    const minimumBalance = parseCurrencyInt(body.minimumBalance) ?? 0;

    const [created] = await db.insert(s.accounts).values({
      userId,
      name: name.trim(),
      type,
      subtype: resolveSubtype(type, body),
      institution: typeof institution === 'string' ? institution.trim() : '',
      accountNumberMasked: typeof accountNumberMasked === 'string' ? accountNumberMasked.trim() : '',
      openingBalance,
      openingBalanceDate: typeof openingBalanceDate === 'string' && openingBalanceDate.trim() ? openingBalanceDate.trim() : null,
      // Nothing has been posted to a new account, so its ledger balance is its opening balance
      currentBalance: openingBalance,
      minimumBalance,
      isPrimary,
      color: typeof color === 'string' && color.trim() ? color.trim() : '#09090b'
    }).returning();

    if (type !== 'bank') return serialize(created);

    const [{ count: activeBanks }] = await db
      .select({ count: count() })
      .from(s.accounts)
      .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'bank'), eq(s.accounts.isArchived, false)));

    let account = created;
    const isOnlyBank = Number(activeBanks) === 1;
    if (isPrimary || isOnlyBank) {
      if (isOnlyBank && !isPrimary) {
        [account] = await db.update(s.accounts)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(s.accounts.id, created.id))
          .returning();
      }
      try {
        await backfillUnassignedTransactions(userId, account);
      } catch (backfillErr) {
        console.error('Failed to backfill transactions on bank account creation:', backfillErr);
      }
    }

    return serialize(account);
  },

  /**
   * Updates an account. A new opening balance is also written to the active
   * month's opening snapshot and the ledger balance is recomputed from it.
   */
  async updateAccount(userId, accountId, body = {}, { expectedType = null, notFoundMessage = 'Account not found' } = {}) {
    const account = await findOwnedAccount(userId, accountId, expectedType, notFoundMessage);
    const { name, institution, accountNumberMasked, isPrimary, isArchived, color } = body;
    const updates = { updatedAt: new Date() };

    if (isPrimary === true) {
      await demotePrimary(userId, account.type);
      updates.isPrimary = true;
    } else if (isPrimary === false) {
      updates.isPrimary = false;
    }

    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof institution === 'string') updates.institution = institution.trim();
    if (typeof accountNumberMasked === 'string') updates.accountNumberMasked = accountNumberMasked.trim();
    const subtype = resolveUpdatedSubtype(account.type, body);
    if (subtype) updates.subtype = subtype;

    const openingBalance = parseCurrencyInt(body.openingBalance);
    if (openingBalance !== undefined) updates.openingBalance = openingBalance;
    const minimumBalance = parseCurrencyInt(body.minimumBalance);
    if (minimumBalance !== undefined) updates.minimumBalance = minimumBalance;

    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      if (isArchived) updates.isPrimary = false;
    }
    if (typeof color === 'string' && color.trim()) updates.color = color.trim();

    let [updated] = await db.update(s.accounts)
      .set(updates)
      .where(eq(s.accounts.id, account.id))
      .returning();

    if (openingBalance !== undefined) {
      const activeMonth = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.isClosed, false)),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });
      if (activeMonth) {
        const existingOpening = await db.query.monthAccountOpenings.findFirst({
          where: and(eq(s.monthAccountOpenings.monthId, activeMonth.id), eq(s.monthAccountOpenings.accountId, account.id))
        });
        if (existingOpening) {
          await db.update(s.monthAccountOpenings).set({ amount: openingBalance }).where(eq(s.monthAccountOpenings.id, existingOpening.id));
        } else {
          await db.insert(s.monthAccountOpenings).values({ monthId: activeMonth.id, accountId: account.id, amount: openingBalance });
        }
      }
      await LedgerService.recomputeAccountBalance(account.id);
      updated = await db.query.accounts.findFirst({ where: eq(s.accounts.id, account.id) });
    }

    return serialize(updated);
  },

  /** Soft-archives an account; history stays intact. */
  async archiveAccount(userId, accountId, { expectedType = null, notFoundMessage = 'Account not found' } = {}) {
    const account = await findOwnedAccount(userId, accountId, expectedType, notFoundMessage);
    const [updated] = await db.update(s.accounts)
      .set({ isArchived: true, isPrimary: false, updatedAt: new Date() })
      .where(eq(s.accounts.id, account.id))
      .returning();
    return serialize(updated);
  }
};
