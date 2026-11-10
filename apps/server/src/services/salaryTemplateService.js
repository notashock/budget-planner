import { eq, and, desc, or, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import {
  calculatePeriodBoundaries,
  getNextPeriodBoundaries,
  getDaysInMonth,
  clampDayToMonth,
  formatDate
} from '@budget/engine';
import { validateUserAccount } from './accountValidation.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';
import { isHistoricalPastMonth } from '../domain/monthLifecycle.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function getTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const SalaryTemplateService = {
  /**
   * Retrieves the active salary template for a user.
   */
  async getActiveTemplate(userId) {
    const template = await db.query.salaryTemplates.findFirst({
      where: and(
        eq(s.salaryTemplates.userId, userId),
        eq(s.salaryTemplates.isActive, true)
      ),
      orderBy: [desc(s.salaryTemplates.version), desc(s.salaryTemplates.createdAt)]
    });
    return template ? serialize(template) : null;
  },

  /**
   * Creates or updates a versioned salary template, updates settings, and provisions rolling periods.
   */
  async saveTemplate(userId, payload) {
    const { amount, expectedCreditDay, receivingAccountId, periodType, effectiveDate } = payload;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('A positive salary amount is required');
    }

    const creditDay = Number(expectedCreditDay);
    if (!creditDay || isNaN(creditDay) || creditDay < 1 || creditDay > 31) {
      throw new ValidationError('Expected credit day must be between 1 and 31');
    }

    if (!receivingAccountId) {
      throw new ValidationError('Receiving account ID is required');
    }

    // Validate account ownership
    await validateUserAccount(userId, receivingAccountId);

    const validPeriodType = periodType === 'salary_cycle' ? 'salary_cycle' : 'calendar_month';
    const effDate = effectiveDate && typeof effectiveDate === 'string' ? effectiveDate : getTodayIso();

    const existingActive = await db.query.salaryTemplates.findFirst({
      where: and(
        eq(s.salaryTemplates.userId, userId),
        eq(s.salaryTemplates.isActive, true)
      ),
      orderBy: [desc(s.salaryTemplates.version)]
    });

    let newVersion = 1;
    if (existingActive) {
      newVersion = (existingActive.version || 1) + 1;
      // Mark existing inactive
      await db.update(s.salaryTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(s.salaryTemplates.id, existingActive.id));
    }

    const [created] = await db.insert(s.salaryTemplates).values({
      userId,
      amount: Math.round(numAmount),
      expectedCreditDay: creditDay,
      receivingAccountId,
      periodType: validPeriodType,
      effectiveDate: effDate,
      isActive: true,
      version: newVersion
    }).returning();

    // Update settings profile
    const existingSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, userId)
    });

    const targetIncomeMode = existingSettings?.incomeMode === 'both' ? 'both' : 'salary';

    await db.update(s.settings)
      .set({
        incomeMode: targetIncomeMode,
        periodType: validPeriodType,
        defaultIncomeAmount: Math.round(numAmount),
        defaultIncomeCreditDay: creditDay,
        defaultSalaryAccountId: receivingAccountId,
        updatedAt: new Date()
      })
      .where(eq(s.settings.userId, userId));

    // Provision rolling 2-period horizon
    await this.ensureRollingPeriods(userId, effDate);

    return serialize(created);
  },

  /**
   * Deactivates the active salary template without deleting past history.
   */
  async deactivateTemplate(userId) {
    await db.update(s.salaryTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(s.salaryTemplates.userId, userId), eq(s.salaryTemplates.isActive, true)));

    await db.update(s.settings)
      .set({ incomeMode: 'irregular', updatedAt: new Date() })
      .where(eq(s.settings.userId, userId));

    return { status: 'success', message: 'Salary template deactivated' };
  },

  /**
   * Provisions active period and 1 period forward (rolling 2-period horizon) so the user never creates months by hand.
   */
  async ensureRollingPeriods(userId, asOfDate) {
    let template = await this.getActiveTemplate(userId);
    if (!template) {
      const existing = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId)),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });

      let receivingAccountId = existing?.salaryAccountId || null;
      if (!receivingAccountId) {
        const primaryAccount = await db.query.accounts.findFirst({
          where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)),
          orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
        });
        receivingAccountId = primaryAccount?.id || null;
      }

      if (existing || receivingAccountId) {
        template = {
          amount: existing?.incomeAmount || 0,
          expectedCreditDay: 1,
          receivingAccountId: receivingAccountId || null,
          periodType: 'calendar_month',
          isActive: true
        };
      }
    }
    if (!template || !template.isActive) return;

    const targetDate = asOfDate || getTodayIso();

    // Lookup receiving account's openingBalanceDate
    const receivingAccount = template.receivingAccountId ? await db.query.accounts.findFirst({
      where: and(eq(s.accounts.id, template.receivingAccountId), eq(s.accounts.userId, userId))
    }) : null;
    const openingBalanceDate = receivingAccount?.openingBalanceDate || null;

    // Period 1 (Active period)
    const p1Bounds = calculatePeriodBoundaries({
      periodType: template.periodType,
      creditDay: template.expectedCreditDay,
      targetDate,
      openingBalanceDate
    });

    const p1Month = await this._ensurePeriodMonthAndSalary(userId, template, p1Bounds, targetDate);

    // Strictly Just-In-Time: Only provision the current active cycle. Never auto-provision future months.
    return { p1Month, p1Bounds };
  },

  /**
   * Internal helper: finds or creates month and planned salary transaction for a period boundary.
   */
  async _ensurePeriodMonthAndSalary(userId, template, bounds, targetDate) {
    const cycleStartRef = bounds.originalStartDate || bounds.startDate;
    const parts = cycleStartRef.split('-');
    const year = parseInt(parts[0], 10);
    const monthNum = parseInt(parts[1], 10);

    let month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (month && month.isClosed) {
      const todayIso = getTodayIso();
      // If the period endDate has actually elapsed in the past, provision the succeeding period.
      // But if the month is ongoing (todayIso <= bounds.endDate), it must NOT be closed! Auto-heal it.
      if (bounds.endDate < todayIso) {
        const nextBounds = getNextPeriodBoundaries({
          periodType: template.periodType,
          creditDay: template.expectedCreditDay,
          previousEndDate: bounds.endDate
        });
        return this._ensurePeriodMonthAndSalary(userId, template, nextBounds, targetDate);
      } else {
        await db.update(s.months)
          .set({ isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
          .where(eq(s.months.id, month.id));
        month.isClosed = false;
        month.closedAt = null;
        month.closingBalances = null;
      }
    }

    if (!month) {
      // Find predecessor month if any to carry forward ending balances, or seed from accounts
      const predecessor = await db.query.months.findFirst({
        where: and(
          eq(s.months.userId, userId),
          or(
            lt(s.months.year, year),
            and(eq(s.months.year, year), lt(s.months.month, monthNum))
          )
        ),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });

      const userAccounts = await db.query.accounts.findMany({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      });

      let initialTotalOpening = 0;
      const initialOpenings = [];

      if (predecessor && predecessor.isClosed && predecessor.closingBalances) {
        for (const acc of userAccounts) {
          const snap = predecessor.closingBalances[acc.id];
          const amt = snap ? snap.closingBalance : (acc.openingBalance || 0);
          initialOpenings.push({ accountId: acc.id, amount: amt });
          initialTotalOpening += amt;
        }
      } else {
        for (const acc of userAccounts) {
          const amt = acc.openingBalance || 0;
          initialOpenings.push({ accountId: acc.id, amount: amt });
          initialTotalOpening += amt;
        }
      }

      const effectiveStartDate = bounds.startDate;

      const [newMonth] = await db.insert(s.months).values({
        userId,
        year,
        month: monthNum,
        startDate: effectiveStartDate,
        endDate: bounds.endDate,
        openingBalance: initialTotalOpening,
        incomeAmount: template.amount,
        salaryAccountId: template.receivingAccountId,
        safetyFloor: predecessor?.safetyFloor || 0,
        unplannedAllowance: 0,
        isSalaryCredited: false,
        salaryCreditedDate: null
      }).returning();
      month = newMonth;

      for (const op of initialOpenings) {
        await db.insert(s.monthAccountOpenings).values({
          monthId: newMonth.id,
          accountId: op.accountId,
          amount: op.amount
        });
      }
    } else {
      // Update boundaries if missing
      if (!month.startDate || !month.endDate) {
        const [updated] = await db.update(s.months)
          .set({
            startDate: bounds.startDate,
            endDate: bounds.endDate,
            incomeAmount: month.incomeAmount || template.amount,
            salaryAccountId: month.salaryAccountId || template.receivingAccountId,
            updatedAt: new Date()
          })
          .where(eq(s.months.id, month.id))
          .returning();
        month = updated;
      }
    }

    // Determine expected salary credit date within period
    let creditDateStr = bounds.startDate;
    if (template.periodType === 'salary_cycle') {
      creditDateStr = bounds.originalStartDate || bounds.startDate;
    } else {
      const daysInMonth = getDaysInMonth(year, monthNum);
      const clampedDay = clampDayToMonth(template.expectedCreditDay, daysInMonth);
      creditDateStr = formatDate(year, monthNum, clampedDay);
    }

    // Update income credit date and amount on month metadata if not already set (Pure Date Marker / No Planned Transaction in Ledger)
    if (!month.incomeCreditDate || month.incomeCreditDate !== creditDateStr || !month.incomeAmount) {
      const [updated] = await db.update(s.months)
        .set({
          incomeCreditDate: creditDateStr,
          incomeAmount: month.incomeAmount || template.amount || 0,
          salaryAccountId: month.salaryAccountId || template.receivingAccountId,
          updatedAt: new Date()
        })
        .where(eq(s.months.id, month.id))
        .returning();
      if (updated) month = updated;
    }

    return month;
  },

  /**
   * Called when a salary transaction is settled/marked paid.
   * Closes the completed period, snapshots account closing balances, and advances the rolling horizon.
   */
  async onSalaryCredited(userId, salaryTx, actualDate, options = {}) {
    if (!salaryTx.monthId) return null;

    const month = await db.query.months.findFirst({
      where: and(eq(s.months.id, salaryTx.monthId), eq(s.months.userId, userId))
    });
    if (!month) return null;

    const accountsList = await db.query.accounts.findMany({
      where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
    });

    const openings = await db.query.monthAccountOpenings.findMany({
      where: eq(s.monthAccountOpenings.monthId, month.id)
    });
    const openingMap = new Map();
    openings.forEach((o) => openingMap.set(o.accountId, o.amount));

    // Get all successful transactions for this month
    const txs = await db.query.transactions.findMany({
      where: and(
        eq(s.transactions.userId, userId),
        eq(s.transactions.monthId, month.id),
        eq(s.transactions.status, 'successful')
      )
    });

    // Get transfers for this month
    const transfers = await db.query.transfers.findMany({
      where: and(
        eq(s.transfers.userId, userId),
        eq(s.transfers.monthId, month.id)
      )
    });

    const closingBalancesSnapshot = {};

    const transferIdsInTable = new Set(transfers.map((tr) => String(tr.id)));
    const isTransferTx = (t) => t.origin === 'transfer' || t.category === 'Transfer' || Boolean(t.destinationAccountId) || Boolean(t.transferId);

    for (const acc of accountsList) {
      const accOpening = openingMap.has(acc.id)
        ? openingMap.get(acc.id)
        : (acc.openingBalance || 0);

      const accTxs = txs.filter((t) => t.accountId === acc.id);
      const inflow = accTxs
        .filter((t) => t.isIncome && !isTransferTx(t))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const outflow = accTxs
        .filter((t) => !t.isIncome && !isTransferTx(t))
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const inTransfers = transfers
        .filter((tr) => tr.destinationAccountId === acc.id)
        .reduce((sum, tr) => sum + (tr.amount || 0), 0);
      const outTransfers = transfers
        .filter((tr) => tr.sourceAccountId === acc.id)
        .reduce((sum, tr) => sum + (tr.amount || 0), 0);

      const orphanOutTransfers = txs
        .filter((t) => t.accountId === acc.id && isTransferTx(t) && (!t.transferId || !transferIdsInTable.has(String(t.transferId))))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const orphanInTransfers = txs
        .filter((t) => t.destinationAccountId === acc.id && isTransferTx(t) && (!t.transferId || !transferIdsInTable.has(String(t.transferId))))
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalInflow = inflow + inTransfers + orphanInTransfers;
      const totalOutflow = outflow + outTransfers + orphanOutTransfers;
      const closingBalance = accOpening + totalInflow - totalOutflow;

      closingBalancesSnapshot[acc.id] = {
        accountId: acc.id,
        name: acc.name,
        type: acc.type,
        openingBalance: accOpening,
        closingBalance,
        totalInflow,
        totalOutflow
      };
    }

    const todayIso = getTodayIso();
    const shouldAdvance = Boolean(options.advance);
    const isOngoingCycle = !shouldAdvance && (month.endDate ? todayIso <= month.endDate : !isHistoricalPastMonth(month));

    if (isOngoingCycle) {
      // In-cycle salary fulfillment: Mark salary credited on the current active month, but keep it open!
      await db.update(s.months)
        .set({
          isSalaryCredited: true,
          salaryCreditedDate: actualDate || todayIso,
          incomeAmount: salaryTx.amount || month.incomeAmount,
          updatedAt: new Date()
        })
        .where(eq(s.months.id, month.id));

      const updatedMonth = await db.query.months.findFirst({
        where: eq(s.months.id, month.id)
      });

      return {
        month: updatedMonth,
        advanced: false,
        message: 'Salary credited successfully. Current cycle remains active.'
      };
    }

    // Period elapsed: Confirming salary credit completes the active cycle and rolls forward to the next period.
    // Adjust current month endDate to the day before the salary credit date if actualDate provided, ensuring endDate >= startDate
    let effectiveEndDate = month.endDate;
    if (actualDate) {
      const [y, m, d] = actualDate.split('-').map(Number);
      const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
      const prevDayStr = `${prevDay.getUTCFullYear()}-${pad(prevDay.getUTCMonth() + 1)}-${pad(prevDay.getUTCDate())}`;
      if (month.startDate && prevDayStr >= month.startDate) {
        effectiveEndDate = prevDayStr;
      } else {
        effectiveEndDate = actualDate;
      }
    }

    // Mark current month closed and snapshot closing balances
    await db.update(s.months)
      .set({
        isClosed: true,
        closedAt: new Date(),
        closingBalances: closingBalancesSnapshot,
        isSalaryCredited: true,
        salaryCreditedDate: actualDate || getTodayIso(),
        incomeAmount: salaryTx.amount || month.incomeAmount,
        endDate: effectiveEndDate,
        updatedAt: new Date()
      })
      .where(eq(s.months.id, month.id));

    // Next period boundary: starts strictly on the date of salary credit for salary_cycle, or next calendar month
    const template = await this.getActiveTemplate(userId);
    let nextStartDate = actualDate || month.endDate;
    if (template?.periodType === 'calendar_month' || (!template && !month.periodType)) {
      const nextYear = month.month === 12 ? month.year + 1 : month.year;
      const nextMonthNum = month.month === 12 ? 1 : month.month + 1;
      nextStartDate = `${nextYear}-${pad(nextMonthNum)}-01`;
    }

    const { p1Month: nextMonth } = (await this.ensureRollingPeriods(userId, nextStartDate)) || {};

    let effectiveNextMonth = nextMonth;
    // Fallback safety net: if ensureRollingPeriods failed to provision nextMonth, execute rollover
    if (!effectiveNextMonth || !effectiveNextMonth.id) {
      try {
        const { MonthLifecycle } = await import('../domain/monthLifecycle.js');
        const rolloverRes = await MonthLifecycle.rolloverMonth(userId, month.year, month.month, {
          carryBalance: true,
          rolloverUnpaidOneTimeItems: true
        });
        if (rolloverRes?.month) {
          effectiveNextMonth = rolloverRes.month;
        }
      } catch (rolloverErr) {
        console.error('[SalaryTemplateService] Safety rollover in onSalaryCredited failed:', rolloverErr);
      }
    }

    // Propagate closing balances into next month's opening balances automatically
    if (effectiveNextMonth && effectiveNextMonth.id) {
      for (const [accId, snap] of Object.entries(closingBalancesSnapshot)) {
        const existingOpening = await db.query.monthAccountOpenings.findFirst({
          where: and(
            eq(s.monthAccountOpenings.monthId, effectiveNextMonth.id),
            eq(s.monthAccountOpenings.accountId, accId)
          )
        });
        if (existingOpening) {
          await db.update(s.monthAccountOpenings)
            .set({ amount: snap.closingBalance })
            .where(eq(s.monthAccountOpenings.id, existingOpening.id));
        } else {
          await db.insert(s.monthAccountOpenings).values({
            monthId: effectiveNextMonth.id,
            accountId: accId,
            amount: snap.closingBalance
          });
        }
      }

      // Carry forward any unsettled planned commitments from the closed cycle into the newly opened cycle
      await db.update(s.transactions)
        .set({ monthId: effectiveNextMonth.id, updatedAt: new Date() })
        .where(and(eq(s.transactions.monthId, month.id), eq(s.transactions.status, 'planned')));

      // Carry forward any deferred goals from the closed cycle into the newly opened cycle
      await db.update(s.goals)
        .set({ monthId: effectiveNextMonth.id, updatedAt: new Date() })
        .where(and(eq(s.goals.monthId, month.id), eq(s.goals.status, 'deferred')));
    }

    return {
      closedMonthId: month.id,
      closingBalances: closingBalancesSnapshot,
      nextMonthId: effectiveNextMonth?.id || null,
      nextMonth: effectiveNextMonth || null
    };
  }
};
