import { pool } from '../db/index.js';

export async function migrateReviewModeAndClosedMonths() {
  console.log('=== Starting Migration: Review Mode & Closed Months Snapshot ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Add is_closed, closed_at, and closing_balances to months
    console.log('1. Adding is_closed, closed_at, and closing_balances to months...');
    await client.query(`
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "is_closed" boolean DEFAULT false NOT NULL;
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
      ALTER TABLE "months" ADD COLUMN IF NOT EXISTS "closing_balances" jsonb;
    `);

    await client.query('COMMIT');
    console.log('=== Migration Review Mode & Closed Months Completed Successfully ===');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct CLI execution: node src/scripts/migrate_review_mode_and_closed_months.js
if (process.argv[1] && process.argv[1].endsWith('migrate_review_mode_and_closed_months.js')) {
  migrateReviewModeAndClosedMonths()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
