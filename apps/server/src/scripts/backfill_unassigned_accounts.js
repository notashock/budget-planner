#!/usr/bin/env node
// One-time replacement for the backfill that used to run on every month and transaction read.
// Assigns transactions and planned items that have no account (legacy rows from before accounts
// existed) to the user's primary account, then recomputes that account's ledger balance. Rows on an
// archived account are left where they are. New rows never need this: every create path already
// defaults to the primary account.
//
// Usage:  node src/scripts/backfill_unassigned_accounts.js           dry run, counts rows per user
//         node src/scripts/backfill_unassigned_accounts.js --apply   assigns them
import { pool } from '../db/index.js';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';

const COUNT_SQL = `
SELECT u.user_id,
       COUNT(*) FILTER (WHERE u.kind = 'transaction') AS transactions,
       COUNT(*) FILTER (WHERE u.kind = 'item') AS items
FROM (
  SELECT t.user_id, 'transaction' AS kind FROM transactions t
  WHERE t.account_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = t.account_id AND a.user_id = t.user_id)
  UNION ALL
  SELECT i.user_id, 'item' FROM items i
  WHERE i.account_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = i.account_id AND a.user_id = i.user_id)
) u
WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.user_id AND a.is_archived = false)
GROUP BY u.user_id`;

async function main() {
  const apply = process.argv.includes('--apply');
  const { rows } = await pool.query(COUNT_SQL);
  console.log(`${rows.length} user(s) have unassigned rows.`);
  for (const r of rows) console.log(`  user ${r.user_id}: ${r.transactions} transaction(s), ${r.items} item(s)`);
  if (!apply) {
    if (rows.length > 0) console.log('Dry run. Re-run with --apply to assign them to each user\'s primary account.');
    return;
  }
  for (const r of rows) {
    const { modifiedCount } = await backfillUnassignedTransactions(r.user_id);
    console.log(`  user ${r.user_id}: assigned ${modifiedCount} transaction(s)`);
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
