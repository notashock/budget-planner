#!/usr/bin/env node
// Renames existing salary-cycle months to the month each cycle mostly covers (the rule new months follow
// since periodMonthKey). Before it, a cycle was filed under its start month: 30 Oct - 29 Nov was "October".
//
// Only users whose active salary template uses salary_cycle are touched, and only months with both dates.
// The cycle's real start comes from the template's credit day when that reproduces the stored end date
// (a first month can start late, on the opening-balance date); otherwise the stored start date is used.
// Every other table points at a month by id, so only months.year/month change. A rename that would land
// on a name another month keeps is skipped and reported.
//
// Usage:  node src/scripts/rename_salary_cycle_months.js                  dry run, prints what would change
//         node src/scripts/rename_salary_cycle_months.js --apply          writes a JSON backup, then renames in one transaction
//         add --user-id=<uuid> to limit either run to one user
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { calculatePeriodBoundaries } from '@budget/engine';
import { config } from '../config.js';
import { periodMonthKey } from '../services/salaryTemplateService.js';

const MONTHS_SQL = `
SELECT m.id, m.user_id, m.year, m.month, m.start_date, m.end_date, t.expected_credit_day
FROM months m
JOIN LATERAL (
  SELECT period_type, expected_credit_day FROM salary_templates st
  WHERE st.user_id = m.user_id AND st.is_active = true
  ORDER BY st.effective_date DESC, st.version DESC LIMIT 1
) t ON t.period_type = 'salary_cycle'
WHERE m.start_date IS NOT NULL AND m.end_date IS NOT NULL
  AND ($1::uuid IS NULL OR m.user_id = $1::uuid)
ORDER BY m.user_id, m.start_date`;

const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

function targetName(r) {
  const b = calculatePeriodBoundaries({ periodType: 'salary_cycle', creditDay: r.expected_credit_day, targetDate: r.end_date });
  const originalStartDate = b.endDate === r.end_date ? b.originalStartDate : null;
  return periodMonthKey({ originalStartDate, startDate: r.start_date }, 'salary_cycle');
}

/** Works out every rename one user's months need; a rename onto a name that stays taken is a conflict. */
function planUser(rows, allNames) {
  let renames = rows
    .map((r) => ({ ...r, to: targetName(r) }))
    .filter((r) => r.to.year !== r.year || r.to.month !== r.month);
  const conflicts = [];
  for (;;) {
    const moving = new Set(renames.map((r) => r.id));
    const finalNames = new Map(); // name -> count after the renames
    for (const n of allNames) if (!moving.has(n.id)) finalNames.set(key(n.year, n.month), (finalNames.get(key(n.year, n.month)) || 0) + 1);
    for (const r of renames) finalNames.set(key(r.to.year, r.to.month), (finalNames.get(key(r.to.year, r.to.month)) || 0) + 1);
    const clash = renames.filter((r) => finalNames.get(key(r.to.year, r.to.month)) > 1);
    if (clash.length === 0) return { renames, conflicts };
    // Drop the latest clashing rename and retry: it keeps its old name, which may free or take another
    const drop = clash[clash.length - 1];
    conflicts.push(drop);
    renames = renames.filter((r) => r.id !== drop.id);
  }
}

/**
 * Finds salary-cycle months filed under the wrong name and, with apply, writes a backup and renames them.
 * @returns {Promise<{ renames: Array<object>, conflicts: Array<object>, backupPath: string|null }>}
 */
export async function renameSalaryCycleMonths(client, { apply = false, userId = null, backupDir = process.cwd() } = {}) {
  const { rows } = await client.query(MONTHS_SQL, [userId]);
  const byUser = new Map();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r]);

  const renames = [];
  const conflicts = [];
  for (const [uid, userRows] of byUser) {
    // Every month of the user holds a name, including ones without dates
    const { rows: allNames } = await client.query('SELECT id, year, month FROM months WHERE user_id = $1', [uid]);
    const plan = planUser(userRows, allNames);
    renames.push(...plan.renames);
    conflicts.push(...plan.conflicts);
  }
  if (!apply || renames.length === 0) return { renames, conflicts, backupPath: null };

  const backupPath = path.join(backupDir, `months_names_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(renames.map(({ id, user_id, year, month }) => ({ id, user_id, year, month })), null, 2));

  await client.query('BEGIN');
  try {
    // Two steps so a chain (Oct -> Nov while Nov -> Dec) never hits uq_user_year_month half-way
    for (const r of renames) {
      const res = await client.query('UPDATE months SET year = year + 10000 WHERE id = $1 AND year = $2 AND month = $3', [r.id, r.year, r.month]);
      if (res.rowCount !== 1) throw new Error(`Month ${r.id} changed since the read; nothing renamed.`);
    }
    for (const r of renames) {
      await client.query('UPDATE months SET year = $1, month = $2, updated_at = now() WHERE id = $3', [r.to.year, r.to.month, r.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return { renames, conflicts, backupPath };
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
    const { renames, conflicts, backupPath } = await renameSalaryCycleMonths(client, { apply, userId });
    console.log(`${renames.length} month(s) to rename; ${conflicts.length} skipped because the new name is taken.`);
    for (const r of renames) {
      console.log(`  user ${r.user_id}  ${r.start_date}..${r.end_date}: ${key(r.year, r.month)} -> ${key(r.to.year, r.to.month)}`);
    }
    for (const r of conflicts) {
      console.log(`  SKIPPED user ${r.user_id}  ${r.start_date}..${r.end_date}: ${key(r.year, r.month)} -> ${key(r.to.year, r.to.month)} (taken)`);
    }
    if (backupPath) console.log(`Backup of original names: ${backupPath}\nRenamed ${renames.length} month(s).`);
    else if (renames.length > 0) console.log('Dry run. Re-run with --apply to write a backup and rename these months.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Rename failed:', err.message);
    process.exit(1);
  });
}
