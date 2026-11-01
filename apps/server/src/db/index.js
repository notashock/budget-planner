import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { config } from '../config.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 4,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000
});

export const db = drizzle(pool, { schema });

export async function healPrematurelyClosedMonths() {
  try {
    const res = await pool.query(`
      UPDATE months 
      SET is_closed = false, closed_at = NULL, closing_balances = NULL 
      WHERE is_closed = true 
        AND closed_at IS NULL
        AND (
          end_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          OR (end_date IS NULL AND (year > EXTRACT(YEAR FROM CURRENT_DATE) OR (year = EXTRACT(YEAR FROM CURRENT_DATE) AND month >= EXTRACT(MONTH FROM CURRENT_DATE))))
        );
    `);
    if (res.rowCount > 0) {
      console.log(`Auto-healed ${res.rowCount} prematurely closed active month(s) to open status.`);
    }
  } catch (err) {
    console.warn('Could not run healPrematurelyClosedMonths:', err.message);
  }
}

export async function pruneEmptyFutureMonths() {
  try {
    // 1. Reassign any goals from future months to the user's active current month
    await pool.query(`
      UPDATE goals g
      SET month_id = m_curr.id
      FROM months m_future
      JOIN months m_curr ON m_curr.user_id = m_future.user_id 
        AND (
          (m_curr.start_date <= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AND m_curr.end_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'))
          OR (m_curr.year = EXTRACT(YEAR FROM CURRENT_DATE) AND m_curr.month = EXTRACT(MONTH FROM CURRENT_DATE))
        )
      WHERE g.month_id = m_future.id
        AND (
          m_future.start_date > TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          OR (m_future.start_date IS NULL AND (m_future.year > EXTRACT(YEAR FROM CURRENT_DATE) OR (m_future.year = EXTRACT(YEAR FROM CURRENT_DATE) AND m_future.month > EXTRACT(MONTH FROM CURRENT_DATE))))
        );
    `);

    // 2. Delete auto-generated planned salary transactions in future months
    await pool.query(`
      DELETE FROM transactions t
      USING months m
      WHERE t.month_id = m.id
        AND t.origin = 'salary'
        AND t.status = 'planned'
        AND (
          m.start_date > TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          OR (m.start_date IS NULL AND (m.year > EXTRACT(YEAR FROM CURRENT_DATE) OR (m.year = EXTRACT(YEAR FROM CURRENT_DATE) AND m.month > EXTRACT(MONTH FROM CURRENT_DATE))))
        );
    `);

    // 3. Delete any future months that have NO successful transactions
    const res = await pool.query(`
      DELETE FROM months 
      WHERE (
        start_date > TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
        OR (start_date IS NULL AND (year > EXTRACT(YEAR FROM CURRENT_DATE) OR (year = EXTRACT(YEAR FROM CURRENT_DATE) AND month > EXTRACT(MONTH FROM CURRENT_DATE))))
      )
      AND NOT EXISTS (
        SELECT 1 FROM transactions 
        WHERE transactions.month_id = months.id 
          AND transactions.status = 'successful'
      );
    `);
    if (res.rowCount > 0) {
      console.log(`Pruned ${res.rowCount} premature empty future month(s).`);
    }
  } catch (err) {
    console.warn('Could not run pruneEmptyFutureMonths:', err.message);
  }
}

export async function syncTransferSchema() {
  try {
    await pool.query(`
      ALTER TABLE "transactions" 
      ADD COLUMN IF NOT EXISTS "destination_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS "idx_transactions_dest_account" ON "transactions" ("destination_account_id");
    `);

    const checkTransfers = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfers');
    `);

    if (checkTransfers.rows[0].exists) {
      const res = await pool.query(`
        INSERT INTO "transactions" (
          "id",
          "user_id",
          "month_id",
          "name",
          "status",
          "origin",
          "amount",
          "date",
          "category",
          "note",
          "is_income",
          "account_id",
          "destination_account_id",
          "transfer_id",
          "created_at",
          "updated_at"
        )
        SELECT
          gen_random_uuid(),
          t."user_id",
          t."month_id",
          'Inter-Account Transfer',
          'successful',
          'transfer',
          t."amount",
          t."date",
          'Transfer',
          COALESCE(t."note", ''),
          false,
          t."source_account_id",
          t."destination_account_id",
          t."id",
          t."created_at",
          t."updated_at"
        FROM "transfers" t
        WHERE NOT EXISTS (
          SELECT 1 FROM "transactions" tx WHERE tx."transfer_id" = t."id"
        );
      `);
      if (res.rowCount > 0) {
        console.log(`Auto-backfilled ${res.rowCount} transfer(s) into transactions table with origin='transfer'.`);
      }
    }
  } catch (err) {
    console.warn('Could not run syncTransferSchema:', err.message);
  }
}

export async function runMigrations() {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  try {
    await migrate(db, { migrationsFolder });
    console.log('PostgreSQL database migrations applied successfully.');
    await syncTransferSchema();
    await healPrematurelyClosedMonths();
    await pruneEmptyFutureMonths();
  } catch (err) {
    console.error('Failed to apply PostgreSQL migrations:', err);
    throw err;
  }
}

export { schema };
