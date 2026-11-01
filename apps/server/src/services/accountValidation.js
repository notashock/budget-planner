import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';

/**
 * Validates that a specified financial account (Bank Account or Wallet) belongs to the authenticated user.
 * 
 * @param {object} params
 * @param {string} params.userId - Authenticated user ID
 * @param {'bank'|'wallet'} [params.accountType] - Financial entity discriminator
 * @param {string} params.accountId - Financial account ID to validate
 * @returns {Promise<object|null>} Account record if valid and owned by user, otherwise null
 */
export async function validateUserAccount({ userId, accountType, accountId }) {
  if (!accountId || !userId) {
    return null;
  }

  const conditions = [
    eq(s.accounts.id, accountId),
    eq(s.accounts.userId, userId)
  ];

  if (accountType === 'wallet' || accountType === 'bank') {
    conditions.push(eq(s.accounts.type, accountType));
  }

  const account = await db.query.accounts.findFirst({
    where: and(...conditions)
  });

  return account || null;
}
