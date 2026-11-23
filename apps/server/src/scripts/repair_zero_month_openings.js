#!/usr/bin/env node
// Repairs ₹0 month openings written by the old backfillUnassignedTransactions (fixed in a77bf81).
// Opening a month wrote one month_account_openings row of 0 for the primary bank when the month had none,
// which overrode the account's real balance and made the Plan page start the month from nothing.
//
// A suspect row: amount 0, the only opening row of its month, and months.opening_balance = 0.
// Its correct value is the ledger balance at the month's start: the account's opening balance plus every
// successful transaction dated before the month (and not before the account's opening date). Rows whose
// ledger value is also 0 are genuine and left alone. Rows are updated, not deleted: with no row the simulator
// falls back to the account's creation-time opening, which is wrong for later months.
//
// Usage:  node src/scripts/repair_zero_month_openings.js                  dry run, prints what would change
//         node src/scripts/repair_zero_month_openings.js --apply          writes a JSON backup, then updates in one transaction
//         add --user-id=<uuid> to limit either run to one user
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

// Same signed amounts as LedgerService.recomputeAccountBalance
const SUSPECTS_SQL = `
WITH month_start AS (
  SELECT m.id, m.user_id, m.year, m.month,
         COALESCE(m.start_date, m.year || '-' || LPAD(m.month::text, 2, '0') || '-01') AS start_date
  FROM months m
  WHERE m.opening_balance = 0
    AND ($1::uuid IS NULL OR m.user_id = $1::uuid)
    AND (SELECT COUNT(*) FROM month_account_openings o2 WHERE o2.month_id = m.id) = 1
)
SELECT o.id, o.month_id, o.account_id, o.amount AS old_amount,
       ms.user_id, ms.year, ms.month, a.name AS account_name,
       a.opening_balance + COALESCE((
         SELECT SUM(CASE
           WHEN t.origin IN ('held_in', 'lent_repaid') THEN ABS(t.amount)
           WHEN t.origin IN ('held_return', 'lent_out') THEN -ABS(t.amount)
           WHEN t.is_income = true THEN t.amount
           WHEN t.origin = 'transfer' AND t.destination_account_id = a.id THEN t.amount
           WHEN t.origin = 'transfer' AND t.account_id = a.id THEN -t.amount
           ELSE -t.amount
         END)
         FROM transactions t
         WHERE (t.account_id = a.id OR t.destination_account_id = a.id)
           AND t.status = 'successful'
           AND t.date < ms.start_date
           AND (a.opening_balance_date IS NULL OR t.date >= a.opening_balance_date)
       ), 0) AS ledger_amount
FROM month_account_openings o
JOIN month_start ms ON ms.id = o.month_id
JOIN accounts a ON a.id = o.account_id
WHERE o.amount = 0 AND a.type <> 'credit_card'
ORDER BY ms.user_id, ms.year, ms.month`;

/**
 * Finds zero openings that disagree with the ledger and, with apply, writes a backup and updates them.
 * @returns {Promise<{ matched: number, fixes: Array<object>, backupPath: string|null }>}
 */
export async function repairZeroMonthOpenings(client, { apply = false, userId = null, backupDir = process.cwd() } = {}) {
  const { rows } = await client.query(SUSPECTS_SQL, [userId]);
  const fixes = rows
    .map((r) => ({ ...r, old_amount: Number(r.old_amount), ledger_amount: Number(r.ledger_amount) }))
    .filter((r) => r.ledger_amount !== 0);
  if (!apply || fixes.length === 0) return { matched: rows.length, fixes, backupPath: null };

  const backupPath = path.join(backupDir, `month_openings_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(fixes.map(({ id, month_id, account_id, old_amount }) => ({ id, month_id, account_id, amount: old_amount })), null, 2));

  await client.query('BEGIN');
  try {
    for (const r of fixes) {
      // amount = 0 guard: skip a row someone changed since the read
      await client.query('UPDATE month_account_openings SET amount = $1 WHERE id = $2 AND amount = 0', [r.ledger_amount, r.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return { matched: rows.length, fixes, backupPath };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const userId = args.find((a) => a.startsWith('--user-id='))?.split('=')[1] || null;
  const dbUrl = args.find((a) => a.startsWith('--database-url='))?.split('=').slice(1).join('=') || config.databaseUrl;
  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl || '');

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();
  try {
    const { matched, fixes, backupPath } = await repairZeroMonthOpenings(client, { apply, userId });
    console.log(`${matched} zero opening row(s) match; ${fixes.length} disagree with the ledger.`);
    for (const r of fixes) {
      console.log(`  user ${r.user_id}  ${r.year}-${String(r.month).padStart(2, '0')}  ${r.account_name}: 0 -> ${r.ledger_amount}`);
    }
    if (backupPath) console.log(`Backup of original rows: ${backupPath}\nUpdated ${fixes.length} row(s).`);
    else if (fixes.length > 0) console.log('Dry run. Re-run with --apply to write a backup and update these rows.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Repair failed:', err.message);
    process.exit(1);
  });
}
