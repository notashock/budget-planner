import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { recommendPurchaseDate, evaluateGoalsWithReservation } from '@budget/engine';
import { validateUserAccount } from '../services/accountValidation.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { localNow } from '../utils/clock.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Purchase goals: evaluation with priority reservation, scheduling, deferral and the recommended purchase date.
 * Merged into BudgetExecution, so callers use BudgetExecution.<method>().
 */
export const GoalExecution = {
  /**
   * Evaluates active purchase goals with strict priority reservation (ADR 0063).
   */
  async listGoals(userId, year, monthNum) {
    const month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!month) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    const [goals, items, transactions, transfers, accountsList] = await Promise.all([
      db.query.goals.findMany({
        where: and(eq(s.goals.userId, userId), eq(s.goals.monthId, month.id)),
        orderBy: [asc(s.goals.priority), asc(s.goals.createdAt)]
      }),
      db.query.items.findMany({
        where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id))
      }),
      db.query.transactions.findMany({
        where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id))
      }),
      db.query.transfers.findMany({
        where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id))
      }),
      db.query.accounts.findMany({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      })
    ]);

    const now = localNow();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : 0;

    const evaluatedGoals = evaluateGoalsWithReservation({
      settings: {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        currencySymbol: month.currencySymbol || undefined
      },
      items: serialize(items),
      month: { year, month: monthNum },
      goals: serialize(goals),
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      accounts: serialize(accountsList)
    });

    return serialize(evaluatedGoals);
  },

  /**
   * Creates a new purchase goal.
   */
  async createGoal(userId, year, monthNum, payload) {
    const { name, targetAmount, priority = 0 } = payload;

    if (!name || !targetAmount || typeof Number(targetAmount) !== 'number') {
      throw new ValidationError('Valid goal name and target amount required');
    }

    const month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!month) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    let fundingAccountId = payload.fundingAccountId || payload.fundingBankAccountId || payload.fundingWalletId;

    if (!fundingAccountId) {
      const primaryAccount = await db.query.accounts.findFirst({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isPrimary, true), eq(s.accounts.isArchived, false))
      }) || await db.query.accounts.findFirst({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      });
      if (primaryAccount) {
        fundingAccountId = primaryAccount.id;
      }
    }

    const parsedPriority = [0, 1, 2].includes(Number(priority)) ? Number(priority) : 0;

    const [goal] = await db.insert(s.goals).values({
      userId,
      monthId: month.id,
      name: name.trim(),
      targetAmount: Math.round(Number(targetAmount)),
      targetDate: payload.targetDate ? String(payload.targetDate).trim() : null,
      priority: parsedPriority,
      status: payload.status || 'logged',
      fundingAccountId: fundingAccountId || null
    }).returning();

    const evaluatedGoals = await this.listGoals(userId, year, monthNum);
    const targetGoal = evaluatedGoals.find((g) => String(g._id || g.id) === String(goal.id)) || {
      ...serialize(goal),
      recommendation: null
    };

    return targetGoal;
  },

  /**
   * Schedules a goal by generating a linked planned transaction (origin = 'goal').
   */
  async scheduleGoal(userId, goalId, payload = {}) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const month = await db.query.months.findFirst({
      where: eq(s.months.id, goal.monthId)
    });
    if (!month) {
      throw new NotFoundError('Associated month not found');
    }

    let scheduledDate = payload.date || payload.plannedDate || goal.targetDate;
    if (!scheduledDate) {
      try {
        const rec = await this.recommendGoalDate(userId, month.year, month.month, goal.targetAmount, goal.fundingAccountId);
        if (rec?.recommendedDate) {
          scheduledDate = rec.recommendedDate;
        }
      } catch {
        // fallback
      }
      if (!scheduledDate) {
        const now = localNow();
        scheduledDate = `${month.year}-${pad(month.month)}-${pad(Math.min(28, now.getDate()))}`;
      }
    }

    let resolvedAccountId = payload.accountId || goal.fundingAccountId;
    if (resolvedAccountId) {
      const valid = await validateUserAccount({ userId, accountId: resolvedAccountId });
      if (!valid) resolvedAccountId = null;
    }

    const [transaction] = await db.insert(s.transactions).values({
      userId,
      monthId: month.id,
      name: goal.name,
      status: 'planned',
      origin: 'goal',
      amount: goal.targetAmount,
      plannedAmount: goal.targetAmount,
      date: scheduledDate,
      plannedDate: scheduledDate,
      goalId: goal.id,
      category: payload.category || 'Goal',
      note: payload.note || `Scheduled Goal: ${goal.name}`,
      accountId: resolvedAccountId,
      isIncome: false
    }).returning();

    const [updatedGoal] = await db.update(s.goals)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(eq(s.goals.id, goal.id))
      .returning();

    return {
      transaction: serialize(transaction),
      item: serialize(transaction), // legacy alias
      goal: serialize(updatedGoal)
    };
  },

  /**
   * Alias for backward compatibility
   */
  async convertGoalToItem(userId, goalId, payload = {}) {
    return this.scheduleGoal(userId, goalId, payload);
  },

  /**
   * Updates an existing purchase goal.
   */
  async updateGoal(userId, goalId, payload) {
    const existing = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!existing) {
      throw new NotFoundError('Goal not found');
    }

    const updates = { updatedAt: new Date() };
    if (payload.name) updates.name = String(payload.name).trim();
    if (payload.targetAmount !== undefined) updates.targetAmount = Math.round(Number(payload.targetAmount));
    if (payload.priority !== undefined) updates.priority = Number(payload.priority);
    if (payload.status) updates.status = payload.status;
    if (payload.fundingAccountId !== undefined) updates.fundingAccountId = payload.fundingAccountId || null;

    const [updated] = await db.update(s.goals)
      .set(updates)
      .where(eq(s.goals.id, goalId))
      .returning();

    return serialize(updated);
  },

  /**
   * Defers a goal to next month manually.
   */
  async deferGoal(userId, goalId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const currentMonth = await db.query.months.findFirst({
      where: eq(s.months.id, goal.monthId)
    });
    if (!currentMonth) {
      throw new NotFoundError('Current month not found');
    }

    let nextYear = currentMonth.year;
    let nextMonthNum = currentMonth.month + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear += 1;
    }

    let nextMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, nextYear),
        eq(s.months.month, nextMonthNum)
      )
    });

    if (!nextMonth) {
      const [created] = await db.insert(s.months).values({
        userId,
        year: nextYear,
        month: nextMonthNum,
        openingBalance: 0,
        incomeAmount: currentMonth.incomeAmount || 0,
        incomeCreditDate: currentMonth.incomeCreditDate || null,
        salaryAccountId: currentMonth.salaryAccountId || null,
        isSalaryCredited: false,
        salaryCreditedDate: null,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol
      }).returning();
      nextMonth = created;
    }

    const [updated] = await db.update(s.goals)
      .set({
        monthId: nextMonth.id,
        status: 'deferred',
        updatedAt: new Date()
      })
      .where(eq(s.goals.id, goal.id))
      .returning();

    return { message: 'Goal deferred to next month', goal: serialize(updated), nextMonth: serialize(nextMonth) };
  },

  /**
   * Reactivates a deferred goal.
   */
  async reactivateGoal(userId, goalId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const [updated] = await db.update(s.goals)
      .set({
        status: 'active',
        deferredReason: null,
        updatedAt: new Date()
      })
      .where(eq(s.goals.id, goalId))
      .returning();

    return { message: 'Goal reactivated successfully', goal: serialize(updated) };
  },

  /**
   * Deletes a purchase goal.
   */
  async deleteGoal(userId, goalId) {
    const existing = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!existing) {
      throw new NotFoundError('Goal not found');
    }

    await db.delete(s.goals).where(eq(s.goals.id, goalId));
    return { message: 'Goal deleted successfully' };
  },

  /**
   * Recommends a purchase date for a candidate goal amount.
   */
  async recommendGoalDate(userId, year, monthNum, amount, fundingSource = null) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('Valid positive amount is required');
    }

    const month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!month) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    const [items, transactions] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) })
    ]);

    const now = localNow();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : null;

    const rec = recommendPurchaseDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items,
      { year, month: monthNum },
      numAmount,
      transactions
    );

    return rec;
  }
};
