import { eq, and, desc, asc, count } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import * as s from '../db/schema.js';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';
import { LedgerService } from './ledgerService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';

const ACCOUNT_TYPES = ['bank', 'wallet', 'cash', 'credit_card'];
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
  if (type === 'credit_card') return 'credit_card';
  if (type === 'wallet') {
    const wanted = body.walletType ?? body.subtype;
    return WALLET_SUBTYPES.includes(wanted) ? wanted : 'cash';
  }
  const wanted = body.accountType ?? body.subtype;
  if (BANK_SUBTYPES.includes(wanted)) return wanted;
  return type === 'cash' ? 'cash' : 'checking';
}

function resolveUpdatedSubtype(type, body) {
  if (type === 'credit_card') return undefined;
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

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDay(val, label) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    throw new ValidationError(`${label} must be a day of the month between 1 and 31`);
  }
  return n;
}

/**
 * Card settings from a request body (ADR 0070). The bill generation day and the
 * due day are always the user's own; nothing is assumed.
 */
async function parseCardFields(userId, body, { requireDays }) {
  const fields = {};
  const statementDay = parseDay(body.statementDay, 'Bill generation day');
  const dueDay = parseDay(body.dueDay, 'Due day');
  if (requireDays && (statementDay === undefined || dueDay === undefined)) {
    throw new ValidationError('A credit card needs a bill generation day and a due day');
  }
  if (statementDay !== undefined) fields.statementDay = statementDay;
  if (dueDay !== undefined) fields.dueDay = dueDay;
  const creditLimit = parseCurrencyInt(body.creditLimit);
  if (creditLimit !== undefined) {
    if (creditLimit < 0) throw new ValidationError('Credit limit cannot be negative');
    fields.creditLimit = creditLimit;
  }
  if (body.payFromAccountId !== undefined) {
    if (!body.payFromAccountId) {
      fields.payFromAccountId = null;
    } else {
      const payer = await db.query.accounts.findFirst({
        where: and(eq(s.accounts.id, body.payFromAccountId), eq(s.accounts.userId, userId))
      });
      if (!payer || payer.type === 'credit_card') {
        throw new ValidationError('The bill must be paid from one of your bank accounts or wallets');
      }
      fields.payFromAccountId = payer.id;
    }
  }
  return fields;
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
    const isCard = type === 'credit_card';
    // A card is never the primary (default payment) account
    const isPrimary = isCard ? false : Boolean(body.isPrimary);
    if (isPrimary) await demotePrimary(userId, type);

    // A card's opening balance is what is owed today, stored negative
    const owedNow = isCard ? Math.abs(parseCurrencyInt(body.currentOutstanding ?? body.openingOutstanding ?? body.openingBalance) ?? 0) : 0;
    const openingBalance = isCard ? -owedNow : (parseCurrencyInt(body.openingBalance) ?? 0);
    const minimumBalance = isCard ? 0 : (parseCurrencyInt(body.minimumBalance) ?? 0);
    const cardFields = isCard ? await parseCardFields(userId, body, { requireDays: true }) : {};

    const [created] = await db.insert(s.accounts).values({
      userId,
      name: name.trim(),
      type,
      subtype: resolveSubtype(type, body),
      institution: typeof institution === 'string' ? institution.trim() : '',
      accountNumberMasked: typeof accountNumberMasked === 'string' ? accountNumberMasked.trim() : '',
      openingBalance,
      openingBalanceDate: typeof openingBalanceDate === 'string' && openingBalanceDate.trim()
        ? openingBalanceDate.trim()
        : (isCard ? todayIso() : null),
      // Nothing has been posted to a new account, so its ledger balance is its opening balance
      currentBalance: openingBalance,
      minimumBalance,
      isPrimary,
      color: typeof color === 'string' && color.trim() ? color.trim() : '#09090b',
      ...cardFields
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
   * Updates an account. A new opening balance shifts each open month's stored start by the same
   * difference, and the ledger balance is recomputed from it.
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

    const isCard = account.type === 'credit_card';
    if (isCard) {
      // A card is never primary; its opening balance is what was owed when it was added
      delete updates.isPrimary;
      Object.assign(updates, await parseCardFields(userId, body, { requireDays: false }));
      const owed = parseCurrencyInt(body.currentOutstanding ?? body.openingOutstanding);
      if (owed !== undefined) updates.openingBalance = -Math.abs(owed);
    }
    const openingBalance = isCard ? updates.openingBalance : parseCurrencyInt(body.openingBalance);
    if (!isCard && openingBalance !== undefined) updates.openingBalance = openingBalance;
    const minimumBalance = isCard ? undefined : parseCurrencyInt(body.minimumBalance);
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

    if (openingBalance !== undefined && isCard) {
      // Cards are not part of a month's cash openings
      await LedgerService.recomputeAccountBalance(account.id);
      updated = await db.query.accounts.findFirst({ where: eq(s.accounts.id, account.id) });
    } else if (openingBalance !== undefined) {
      // A new opening moves every later balance by the same amount, so each open month's stored start
      // moves by that difference too (writing the raw opening there made the month start wrong)
      const shift = openingBalance - (Number(account.openingBalance) || 0);
      if (shift) {
        await pool.query(
          `UPDATE "month_account_openings" o SET "amount" = o."amount" + $1
           FROM "months" m
           WHERE o."month_id" = m."id" AND m."user_id" = $2 AND m."is_closed" = false AND o."account_id" = $3`,
          [shift, userId, account.id]
        );
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
