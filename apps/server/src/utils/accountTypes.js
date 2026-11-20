import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';

/**
 * Account type for every account the user has, archived ones included,
 * read in one query: `Map<accountId, 'bank' | 'wallet' | 'cash' | 'credit_card'>`.
 * @param {string} userId
 * @returns {Promise<Map<string, string>>}
 */
export async function loadAccountTypeMap(userId) {
  const rows = await db
    .select({ id: s.accounts.id, type: s.accounts.type })
    .from(s.accounts)
    .where(eq(s.accounts.userId, userId));
  return new Map(rows.map((r) => [String(r.id), r.type]));
}

/**
 * Fills the legacy `accountType` / `sourceType` / `destinationType` fields on
 * items, transactions and transfers from the real account types. A field is
 * set only when its account id is in the map; fields already set are kept.
 * @template T
 * @param {T[]} rows
 * @param {Map<string, string>} typeById
 * @returns {T[]}
 */
export function attachAccountTypes(rows, typeById) {
  if (!Array.isArray(rows)) return rows;
  const typeOf = (id) => (id ? typeById.get(String(id)) : undefined);
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    const accountType = typeOf(row.accountId);
    if (accountType && !out.accountType) out.accountType = accountType;
    const sourceType = typeOf(row.sourceAccountId);
    if (sourceType && !out.sourceType) out.sourceType = sourceType;
    const destinationType = typeOf(row.destinationAccountId);
    if (destinationType && !out.destinationType) out.destinationType = destinationType;
    return out;
  });
}
