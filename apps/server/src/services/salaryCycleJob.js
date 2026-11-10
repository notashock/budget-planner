import { eq, and, or, desc } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import * as s from '../db/schema.js';
import { SalaryTemplateService } from './salaryTemplateService.js';
import { isHistoricalPastMonth } from '../domain/monthLifecycle.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function getTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const SalaryCycleJob = {
  /**
   * Evaluates salary cycles for a given user.
   * If salary is linked and the salary date is reached (or credited),
   * advances the month cycle so the next month starts on the salary linked date.
   */
  async processUserSalaryCycles(userId) {
    const todayIso = getTodayIso();

    // 1. Get all active (unclosed) months for user
    const openMonths = await db.query.months.findMany({
      where: and(eq(s.months.userId, userId), eq(s.months.isClosed, false)),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });

    if (!openMonths || openMonths.length === 0) {
      // Check if user has previous closed months that require advancing to the active period
      const latestClosed = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.isClosed, true)),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });
      if (latestClosed && (latestClosed.endDate ? latestClosed.endDate < todayIso : isHistoricalPastMonth(latestClosed))) {
        const nextStartDate = todayIso;
        const res = await SalaryTemplateService.ensureRollingPeriods(userId, nextStartDate);
        if (res?.p1Month) {
          return res.p1Month;
        }
      }
      return null;
    }

    let advancedAny = null;

    for (const month of openMonths) {
      // Check if salary is linked on this month or via active salary template
      const hasLinkedSalary = Boolean(
        month.salaryAccountId ||
        month.isSalaryCredited ||
        month.salaryCreditedDate ||
        month.incomeCreditDate
      );

      const template = await SalaryTemplateService.getActiveTemplate(userId);

      if (!hasLinkedSalary && !template) continue;

      // Determine the effective salary date
      // In salary_cycle mode, month.incomeCreditDate is when the cycle started; the transition to the next
      // cycle happens when the cycle period ends (month.endDate).
      // In calendar_month mode, incomeCreditDate is the expected salary date within the month.
      const isSalaryCycle = template?.periodType === 'salary_cycle';
      const salaryLinkedDate = month.salaryCreditedDate ||
        (isSalaryCycle ? (month.endDate || null) : (month.incomeCreditDate || month.endDate || null));

      // 1. In-cycle salary arrival fulfillment (Does NOT close ongoing month)
      const isDateArrived = salaryLinkedDate && (salaryLinkedDate <= todayIso || Boolean(month.isSalaryCredited));

      if (isDateArrived && !month.isSalaryCredited) {
        let salaryTx = await db.query.transactions.findFirst({
          where: and(
            eq(s.transactions.userId, userId),
            eq(s.transactions.monthId, month.id),
            or(
              eq(s.transactions.origin, 'salary'),
              eq(s.transactions.category, 'Salary'),
              eq(s.transactions.category, 'Income'),
              eq(s.transactions.name, 'Monthly Salary'),
              eq(s.transactions.name, 'Expected Monthly Salary')
            )
          ),
          orderBy: [desc(s.transactions.date), desc(s.transactions.createdAt)]
        });

        if (!salaryTx && (month.incomeAmount > 0 || template?.amount > 0)) {
          const [newTx] = await db.insert(s.transactions).values({
            userId,
            monthId: month.id,
            name: 'Monthly Salary',
            status: 'successful',
            origin: 'salary',
            amount: month.incomeAmount || template?.amount || 0,
            date: salaryLinkedDate,
            isIncome: true,
            category: 'Income',
            accountId: month.salaryAccountId || template?.receivingAccountId
          }).returning();
          salaryTx = newTx;
        }

        if (salaryTx) {
          await SalaryTemplateService.onSalaryCredited(userId, salaryTx, salaryLinkedDate);
        }
      }

      // 2. Period Expiration & Rollover: ONLY when cycle period has elapsed (todayIso > month.endDate)
      if (month.endDate && todayIso > month.endDate) {
        let salaryTx = await db.query.transactions.findFirst({
          where: and(
            eq(s.transactions.userId, userId),
            eq(s.transactions.monthId, month.id),
            or(
              eq(s.transactions.origin, 'salary'),
              eq(s.transactions.category, 'Salary'),
              eq(s.transactions.category, 'Income'),
              eq(s.transactions.name, 'Monthly Salary'),
              eq(s.transactions.name, 'Expected Monthly Salary')
            )
          ),
          orderBy: [desc(s.transactions.date), desc(s.transactions.createdAt)]
        });

        const advanceRes = await SalaryTemplateService.onSalaryCredited(
          userId,
          salaryTx || { amount: month.incomeAmount || 0 },
          todayIso
        );
        if (advanceRes?.month) {
          advancedAny = advanceRes.month;
        }
      }
    }

    return advancedAny;
  },

  /**
   * System-wide background job runner.
   * Runs across all registered users to advance pending salary cycles with PostgreSQL advisory locking.
   */
  async runJob() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockRes = await client.query('SELECT pg_try_advisory_xact_lock(987654321) as locked');
      if (!lockRes.rows[0].locked) {
        console.log('[SalaryCycleJob] Another worker instance is currently holding the advisory lock. Skipping run.');
        await client.query('ROLLBACK');
        return;
      }

      const users = await db.query.users.findMany();
      for (const user of users) {
        try {
          await this.processUserSalaryCycles(user.id);
        } catch (err) {
          console.error(`[SalaryCycleJob] Error processing user ${user.id}:`, err);
        }
      }

      await client.query('COMMIT');
    } catch (jobErr) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('[SalaryCycleJob] Background job execution error:', jobErr);
    } finally {
      client.release();
    }
  }
};
