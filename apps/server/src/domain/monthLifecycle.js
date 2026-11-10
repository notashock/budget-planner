import { eq, and, desc, asc, or, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { simulate, recommendPurchaseDate as engineRecommendDate, getSalaryWindowStatus, deriveTransactionState } from '@budget/engine';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';
import { SalaryCycleJob } from '../services/salaryCycleJob.js';
import { SimulationService } from './simulationService.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function getTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isHistoricalPastMonth(month, asOfDate = null) {
  if (!month) return false;
  const now = asOfDate ? new Date(asOfDate) : new Date();
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  if (month.endDate) {
    return month.endDate < todayIso;
  }

  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  if (month.year < currentYear) return true;
  if (month.year === currentYear && month.month < currentMonthNum) return true;
  return false;
}

/**
 * Attaches accountOpeningBalances array to a month record
 */
export async function attachAccountOpeningsToMonth(month) {
  if (!month) return month;

  // If a month was prematurely marked isClosed (without closedAt or closingBalances), auto-heal and unclose it.
  if (month.isClosed && (!month.closedAt || !month.closingBalances)) {
    try {
      await db.update(s.months)
        .set({ isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
        .where(eq(s.months.id, month.id));
      month.isClosed = false;
      month.closedAt = null;
      month.closingBalances = null;
    } catch (_) {
      month.isClosed = false;
    }
  }

  const openings = await db.query.monthAccountOpenings.findMany({
    where: eq(s.monthAccountOpenings.monthId, month.id)
  });
  return {
    ...month,
    accountOpeningBalances: openings.map(o => ({
      accountId: o.accountId,
      amount: o.amount
    }))
  };
}

/**
 * MonthLifecycle Domain Service
 */
export const MonthLifecycle = {
  /**
   * Reconciles prematurely closed current months and prunes unpopulated ghost future months.
   */
  async reconcileAndPruneMonths(userId) {
    const todayIso = getTodayIso();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    const allMonths = await db.query.months.findMany({
      where: eq(s.months.userId, userId),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });

    for (const m of allMonths) {
      // 1. Repair and unclose prematurely closed current/ongoing month
      const isCurrentCalendar = m.year === currentYear && m.month === currentMonthNum;
      if (isCurrentCalendar) {
        const lastDay = new Date(Date.UTC(currentYear, currentMonthNum, 0)).getUTCDate();
        const expectedEndDate = `${currentYear}-${pad(currentMonthNum)}-${pad(lastDay)}`;
        if (!m.endDate || m.endDate < todayIso || (m.startDate && m.endDate < m.startDate)) {
          await db.update(s.months)
            .set({ endDate: expectedEndDate, isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
            .where(eq(s.months.id, m.id));
          m.endDate = expectedEndDate;
          m.isClosed = false;
          m.closedAt = null;
          m.closingBalances = null;
        } else if (m.isClosed && (!m.closedAt || !m.closingBalances)) {
          await db.update(s.months)
            .set({ isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
            .where(eq(s.months.id, m.id));
          m.isClosed = false;
          m.closedAt = null;
          m.closingBalances = null;
        }
      } else {
        const isPast = m.endDate ? m.endDate < todayIso : isHistoricalPastMonth(m);
        if (!isPast && m.isClosed && (!m.closedAt || !m.closingBalances)) {
          await db.update(s.months)
            .set({ isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
            .where(eq(s.months.id, m.id));
          m.isClosed = false;
          m.closedAt = null;
          m.closingBalances = null;
        }
      }

      // 2. Prune ghost future months (e.g. December 2026 when in November 2026)
      const isFuture = (m.startDate && m.startDate > todayIso) ||
        (m.year > currentYear || (m.year === currentYear && m.month > currentMonthNum));

      if (isFuture) {
        const txsList = await db.query.transactions.findMany({
          where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, m.id))
        });
        const realTxs = txsList.filter(t => t.origin !== 'salary' && t.name !== 'Monthly Salary');
        if (realTxs.length === 0) {
          const currentMonthRecord = allMonths.find(cur =>
            (cur.year === currentYear && cur.month === currentMonthNum) ||
            (!cur.isClosed && cur.startDate && cur.endDate && cur.startDate <= todayIso && cur.endDate >= todayIso)
          );
          if (currentMonthRecord && currentMonthRecord.id !== m.id) {
            await db.update(s.goals)
              .set({ monthId: currentMonthRecord.id, updatedAt: new Date() })
              .where(eq(s.goals.monthId, m.id));
          } else {
            await db.delete(s.goals).where(eq(s.goals.monthId, m.id));
          }
          await db.delete(s.items).where(eq(s.items.monthId, m.id));
          await db.delete(s.transactions).where(eq(s.transactions.monthId, m.id));
          await db.delete(s.monthAccountOpenings).where(eq(s.monthAccountOpenings.monthId, m.id));
          await db.delete(s.months).where(eq(s.months.id, m.id));
        }
      }
    }
  },

  /**
   * Lists all months for a user with account opening balances attached (Idempotent read)
   */
  async listMonths(userId) {
    const monthsList = await db.query.months.findMany({
      where: eq(s.months.userId, userId),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });

    return Promise.all(monthsList.map(attachAccountOpeningsToMonth));
  },

  /**
   * Retrieves full month details, items, transactions, transfers, accounts, and dual simulations.
   */
  async getMonthDetails(userId, year, monthNum) {
    const rawMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!rawMonth) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    const month = await attachAccountOpeningsToMonth(rawMonth);

    const allAccounts = await db.query.accounts.findMany({
      where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });
    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    // Auto-backfill unassigned if primary bank exists
    if (allAccounts.length > 0) {
      const primaryBank = allAccounts.find(b => b.isPrimary) || allAccounts[0];
      try {
        await backfillUnassignedTransactions(userId, primaryBank);
        if (!month.salaryAccountId) {
          month.salaryAccountId = primaryBank.id;
          await db.update(s.months)
            .set({ salaryAccountId: primaryBank.id, updatedAt: new Date() })
            .where(eq(s.months.id, month.id));
        }
      } catch (backfillErr) {
        console.error('Error during automatic month backfill:', backfillErr);
      }
    }

    const [items, rawTransactions, transfers, userSettings] = await Promise.all([
      db.query.items.findMany({
        where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)),
        orderBy: [asc(s.items.priority), asc(s.items.createdAt)]
      }),
      db.query.transactions.findMany({
        where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)),
        orderBy: [asc(s.transactions.date), asc(s.transactions.createdAt)]
      }),
      db.query.transfers.findMany({
        where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id)),
        orderBy: [asc(s.transfers.date), asc(s.transfers.createdAt)]
      }),
      db.query.settings.findFirst({
        where: eq(s.settings.userId, userId)
      })
    ]);

    const now = new Date();
    const dueWindowDays = userSettings?.dueWindowDays || 3;
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const transactions = rawTransactions.map((tx) => ({
      ...tx,
      derivedStatus: deriveTransactionState(tx, todayStr, dueWindowDays)
    }));
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = year * 12 + monthNum;

    let currentDay = null;
    if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null;
    } else {
      currentDay = 0;
    }

    const { simulation, accountSimulations } = SimulationService.computeSimulation({
      month,
      bankAccounts,
      wallets,
      accountOpenings: month.accountOpeningBalances || [],
      transactions,
      transfers,
      currentDay
    });

    return {
      month: serialize(month),
      items: [], // Deprecated: unified transactions is the sole entity
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      bankAccounts: serialize(bankAccounts),
      wallets: serialize(wallets),
      simulation,
      accountSimulations
    };
  },

  /**
   * Creates a new budget month with predecessor inheritance and openings.
   */
  async createMonth(userId, data) {
    const {
      year,
      month,
      openingBalance,
      incomeAmount,
      incomeCreditDate,
      incomeCreditDay,
      safetyFloor,
      unplannedAllowance,
      currencySymbol,
      salaryAccountId,
      salaryBankAccountId,
      accountOpeningBalances
    } = data;

    if (!year || !month || month < 1 || month > 12) {
      throw new ValidationError('Valid year and month (1-12) required');
    }

    const existing = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, Number(year)),
        eq(s.months.month, Number(month))
      )
    });
    if (existing) {
      const fullExisting = await attachAccountOpeningsToMonth(existing);
      throw new ConflictError('Month already exists', { existingMonth: serialize(fullExisting) });
    }

    const userSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, userId)
    });

    let defaultIncome = 0;
    let defaultFloor = 0;
    let defaultCreditDate = null;
    let defaultSalaryAcc = null;

    const predecessor = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        or(
          lt(s.months.year, Number(year)),
          and(eq(s.months.year, Number(year)), lt(s.months.month, Number(month)))
        )
      ),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });

    if (predecessor) {
      defaultIncome = predecessor.incomeAmount ?? 0;
      defaultFloor = predecessor.safetyFloor ?? 0;
      defaultCreditDate = predecessor.incomeCreditDate ?? null;
      defaultSalaryAcc = predecessor.salaryAccountId ?? null;
    }

    if (Array.isArray(accountOpeningBalances) && accountOpeningBalances.length > 10) {
      throw new ValidationError('accountOpeningBalances cannot exceed 10 accounts per month');
    }

    const targetSalaryAccId = salaryAccountId || salaryBankAccountId || defaultSalaryAcc;
    if (targetSalaryAccId) {
      const validSalaryBank = await validateUserAccount({
        userId,
        accountId: targetSalaryAccId
      });
      if (!validSalaryBank) {
        throw new ValidationError('Salary account is invalid or not owned by user');
      }
    }

    let finalAccountOpenings = [];
    if (Array.isArray(accountOpeningBalances)) {
      finalAccountOpenings = accountOpeningBalances
        .map((entry) => {
          const id = entry.accountId || entry.bankAccountId || entry.walletId;
          if (!id) return null;
          return {
            accountId: id,
            amount: typeof entry.amount === 'number'
              ? Math.round(entry.amount)
              : (typeof entry.openingBalance === 'number' ? Math.round(entry.openingBalance) : 0)
          };
        })
        .filter(Boolean);

      for (const entry of finalAccountOpenings) {
        const valid = await validateUserAccount({
          userId,
          accountId: entry.accountId
        });
        if (!valid) {
          throw new ValidationError(`Account ${entry.accountId} in accountOpeningBalances is invalid or not owned by user`);
        }
      }
    }

    let finalOpening = typeof openingBalance === 'number' ? Math.round(openingBalance) : 0;
    if (finalAccountOpenings.length > 0 && typeof openingBalance !== 'number') {
      finalOpening = finalAccountOpenings.reduce((sum, a) => sum + (Math.round(Number(a.amount)) || 0), 0);
    } else if (Boolean(data.carryoverBalance || data.carryBalance) && predecessor && typeof openingBalance !== 'number') {
      try {
        const predDetails = await this.getMonthDetails(userId, predecessor.year, predecessor.month);
        if (predDetails?.simulation) {
          finalOpening = Math.round(Number(predDetails.simulation.endingBalance || 0));
          if (Array.isArray(predDetails.simulation.accountSummaries)) {
            finalAccountOpenings = predDetails.simulation.accountSummaries.map(sm => ({
              accountId: sm.id,
              amount: Math.round(Number(sm.endingBalance || 0))
            }));
          }
        }
      } catch (err) {
        // Fallback to default finalOpening if predecessor computation fails
      }
    }

    let resolvedIncomeCreditDate = null;
    if (typeof incomeCreditDate === 'string' && incomeCreditDate.trim()) {
      resolvedIncomeCreditDate = incomeCreditDate.trim();
    } else if (typeof incomeCreditDay === 'number') {
      resolvedIncomeCreditDate = `${year}-${pad(month)}-${pad(Math.max(1, Math.min(28, Math.floor(incomeCreditDay))))}`;
    } else if (defaultCreditDate) {
      const dayPart = defaultCreditDate.split('-')[2] || '01';
      resolvedIncomeCreditDate = `${year}-${pad(month)}-${dayPart}`;
    }

    const [newMonth] = await db.insert(s.months).values({
      userId,
      year: Number(year),
      month: Number(month),
      openingBalance: finalOpening,
      incomeAmount: typeof incomeAmount === 'number'
        ? Math.round(incomeAmount)
        : defaultIncome,
      incomeCreditDate: resolvedIncomeCreditDate,
      safetyFloor: typeof safetyFloor === 'number'
        ? Math.round(safetyFloor)
        : defaultFloor,
      unplannedAllowance: typeof unplannedAllowance === 'number'
        ? Math.round(unplannedAllowance)
        : (userSettings?.defaultUnplannedAllowance ?? 0),
      currencySymbol: currencySymbol || userSettings?.currencySymbol || '₹',
      salaryAccountId: targetSalaryAccId,
      isSalaryCredited: false
    }).returning();

    for (const op of finalAccountOpenings) {
      await db.insert(s.monthAccountOpenings).values({
        monthId: newMonth.id,
        accountId: op.accountId,
        amount: op.amount
      });
    }

    const fullMonth = await attachAccountOpeningsToMonth(newMonth);
    return serialize(fullMonth);
  },

  /**
   * Updates month configuration and re-simulates.
   */
  async updateMonth(userId, year, monthNum, updates) {
    const existingMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!existingMonth) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    if (existingMonth.isClosed) {
      throw new ValidationError('Cannot update settings of a closed review period. Review periods are strictly read-only.');
    }

    const {
      openingBalance,
      incomeAmount,
      incomeCreditDate,
      incomeCreditDay,
      safetyFloor,
      unplannedAllowance,
      currencySymbol,
      salaryAccountId,
      salaryBankAccountId,
      accountOpeningBalances
    } = updates;

    const update = { updatedAt: new Date() };
    if (typeof openingBalance === 'number') {
      update.openingBalance = Math.round(openingBalance);
    } else if (Array.isArray(accountOpeningBalances)) {
      update.openingBalance = accountOpeningBalances.reduce((sum, a) => sum + (Math.round(Number(a.amount)) || 0), 0);
    }
    if (typeof incomeAmount === 'number') update.incomeAmount = Math.round(incomeAmount);
    if (typeof incomeCreditDate === 'string') {
      update.incomeCreditDate = incomeCreditDate.trim() || null;
    } else if (typeof incomeCreditDay === 'number') {
      update.incomeCreditDate = `${year}-${pad(monthNum)}-${pad(Math.max(1, Math.min(28, Math.floor(incomeCreditDay))))}`;
    }
    if (typeof safetyFloor === 'number') update.safetyFloor = Math.round(safetyFloor);
    if (typeof unplannedAllowance === 'number') update.unplannedAllowance = Math.round(unplannedAllowance);
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) update.currencySymbol = currencySymbol.trim();

    const targetSalaryId = salaryAccountId || salaryBankAccountId;
    if (targetSalaryId !== undefined) {
      if (targetSalaryId) {
        const validSalary = await validateUserAccount({
          userId,
          accountId: targetSalaryId
        });
        if (!validSalary) {
          throw new ValidationError('Salary account is invalid or not owned by user');
        }
      }
      update.salaryAccountId = targetSalaryId || null;
    }
    if (typeof updates.salaryCreditedDate === 'string') {
      update.salaryCreditedDate = updates.salaryCreditedDate.trim() || null;
      update.incomeCreditDate = update.salaryCreditedDate;
      if (update.salaryCreditedDate) {
        update.isSalaryCredited = true;
      }
    }
    if (typeof updates.isSalaryCredited === 'boolean') {
      update.isSalaryCredited = updates.isSalaryCredited;
      if (updates.isSalaryCredited && !update.salaryCreditedDate) {
        const now = new Date();
        update.salaryCreditedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      } else if (!updates.isSalaryCredited) {
        update.salaryCreditedDate = null;
      }
    }

    if (Array.isArray(accountOpeningBalances)) {
      if (accountOpeningBalances.length > 10) {
        throw new ValidationError('accountOpeningBalances cannot exceed 10 accounts per month');
      }
      for (const entry of accountOpeningBalances) {
        const id = entry.accountId || entry.bankAccountId || entry.walletId;
        const valid = await validateUserAccount({
          userId,
          accountId: id
        });
        if (!valid) {
          throw new ValidationError(`Account ${id} in accountOpeningBalances is invalid or not owned by user`);
        }
      }

      await db.delete(s.monthAccountOpenings).where(eq(s.monthAccountOpenings.monthId, existingMonth.id));
      for (const op of accountOpeningBalances) {
        const id = op.accountId || op.bankAccountId || op.walletId;
        if (id) {
          await db.insert(s.monthAccountOpenings).values({
            monthId: existingMonth.id,
            accountId: id,
            amount: Number(op.amount) || 0
          });
        }
      }
    }

    const [updatedMonth] = await db.update(s.months)
      .set(update)
      .where(eq(s.months.id, existingMonth.id))
      .returning();

    const month = await attachAccountOpeningsToMonth(updatedMonth);

    const [items, transactions, transfers, allAccounts] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) }),
      db.query.transfers.findMany({ where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id)) }),
      db.query.accounts.findMany({ where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)) })
    ]);

    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : null;

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: month.salaryAccountId,
        isSalaryCredited: Boolean(month.isSalaryCredited),
        salaryCreditedDate: month.salaryCreditedDate,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers: serialize(transfers)
      },
      serialize(items),
      { year, month: monthNum },
      serialize(transactions),
      [],
      serialize(transfers)
    );

    let advancedMonth = null;
    if (update.isSalaryCredited) {
      const creditDate = update.salaryCreditedDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
      if (!salaryTx && (month.incomeAmount > 0 || (typeof update.incomeAmount === 'number' && update.incomeAmount > 0))) {
        const [newTx] = await db.insert(s.transactions).values({
          userId,
          monthId: month.id,
          name: 'Monthly Salary',
          status: 'successful',
          origin: 'salary',
          amount: update.incomeAmount || month.incomeAmount || 0,
          date: creditDate,
          isIncome: true,
          category: 'Salary',
          accountId: update.salaryAccountId || month.salaryAccountId
        }).returning();
        salaryTx = newTx;
      }
      if (salaryTx) {
        const advanceRes = await SalaryTemplateService.onSalaryCredited(userId, salaryTx, creditDate);
        if (advanceRes?.nextMonth) {
          advancedMonth = advanceRes.nextMonth;
        }
      }
    }

    return {
      month: serialize(month),
      advancedMonth: advancedMonth ? serialize(advancedMonth) : null,
      items: serialize(items),
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      bankAccounts: serialize(bankAccounts),
      wallets: serialize(wallets),
      simulation
    };
  },

  /**
   * One-click salary credit recording.
   */
  async creditSalary(userId, year, monthNum, options = {}) {
    const rawMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });
    if (!rawMonth) throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    if (rawMonth.isClosed) {
      throw new ValidationError('Cannot credit salary in a closed review period. Review periods are strictly read-only.');
    }

    const month = await attachAccountOpeningsToMonth(rawMonth);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const allAccounts = await db.query.accounts.findMany({
      where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });
    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    const targetBank = (month.salaryAccountId ? allAccounts.find(b => String(b.id) === String(month.salaryAccountId)) : null) ||
                       allAccounts.find(b => b.isPrimary) ||
                       allAccounts[0];

    const salaryAmt = Number(options.amount || month.incomeAmount || 0);
    const creditDate = options.date || todayStr;

    const windowStatus = getSalaryWindowStatus(
      {
        year,
        month: monthNum,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: month.salaryAccountId
      },
      now
    );

    if (month.isSalaryCredited && windowStatus.isLocked) {
      throw new ValidationError('Salary credit is locked outside the active 10-day salary window');
    }

    let salaryTx = await db.query.transactions.findFirst({
      where: and(
        eq(s.transactions.userId, userId),
        eq(s.transactions.monthId, month.id),
        eq(s.transactions.category, 'Salary')
      )
    });

    if (salaryTx) {
      if (salaryAmt > 0) {
        const [updatedTx] = await db.update(s.transactions)
          .set({
            amount: salaryAmt,
            date: creditDate,
            accountId: targetBank ? targetBank.id : salaryTx.accountId,
            updatedAt: new Date()
          })
          .where(eq(s.transactions.id, salaryTx.id))
          .returning();
        salaryTx = updatedTx;
      }
    } else if (salaryAmt > 0) {
      const [newTx] = await db.insert(s.transactions).values({
        userId,
        monthId: month.id,
        amount: salaryAmt,
        date: creditDate,
        note: 'Monthly Salary',
        category: 'Salary',
        accountId: targetBank ? targetBank.id : null,
        isIncome: true
      }).returning();
      salaryTx = newTx;
    }

    let advanceResult = null;
    if (salaryTx) {
      advanceResult = await SalaryTemplateService.onSalaryCredited(userId, salaryTx, creditDate, { advance: true, ...options });
    }

    const [updatedMonth] = await db.update(s.months)
      .set({
        isSalaryCredited: true,
        salaryCreditedDate: creditDate,
        salaryAccountId: (targetBank && !month.salaryAccountId) ? targetBank.id : month.salaryAccountId,
        updatedAt: new Date()
      })
      .where(eq(s.months.id, month.id))
      .returning();

    const fullMonth = await attachAccountOpeningsToMonth(updatedMonth);

    const [items, transactions, transfers] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) }),
      db.query.transfers.findMany({ where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id)) })
    ]);

    const simulation = simulate(
      {
        openingBalance: fullMonth.openingBalance,
        incomeAmount: fullMonth.incomeAmount,
        incomeCreditDate: fullMonth.incomeCreditDate,
        incomeCreditDay: fullMonth.incomeCreditDate ? parseInt(fullMonth.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: fullMonth.salaryAccountId,
        isSalaryCredited: true,
        salaryCreditedDate: fullMonth.salaryCreditedDate,
        safetyFloor: fullMonth.safetyFloor,
        unplannedAllowance: fullMonth.unplannedAllowance || 0,
        currentDay: now.getDate(),
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: fullMonth.accountOpeningBalances || [],
        transfers: serialize(transfers)
      },
      serialize(items),
      { year, month: monthNum },
      serialize(transactions),
      [],
      serialize(transfers)
    );

    return {
      success: true,
      month: serialize(fullMonth),
      advancedMonth: advanceResult?.nextMonth ? serialize(advanceResult.nextMonth) : null,
      transaction: serialize(salaryTx),
      simulation,
      items: serialize(items),
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      bankAccounts: serialize(bankAccounts),
      wallets: serialize(wallets)
    };
  },

  /**
   * Rollover handler carrying forward ending balances and copying fixed items.
   */
  async rolloverMonth(userId, currentYear, currentMonthNum, options = {}) {
    const rawCurrentMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, currentYear),
        eq(s.months.month, currentMonthNum)
      )
    });

    if (!rawCurrentMonth) {
      throw new NotFoundError(`Current month ${currentYear}-${currentMonthNum} not found`);
    }

    const currentMonth = await attachAccountOpeningsToMonth(rawCurrentMonth);

    const [currentItems, currentTransactions, currentTransfers, allAccounts] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, currentMonth.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, currentMonth.id)) }),
      db.query.transfers.findMany({ where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, currentMonth.id)) }),
      db.query.accounts.findMany({ where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)) })
    ]);

    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    const currentSimulation = simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: currentMonth.incomeCreditDate,
        incomeCreditDay: currentMonth.incomeCreditDate ? parseInt(currentMonth.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: currentMonth.salaryAccountId,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: currentMonth.accountOpeningBalances || [],
        transfers: serialize(currentTransfers)
      },
      serialize(currentItems),
      { year: currentYear, month: currentMonthNum },
      serialize(currentTransactions),
      [],
      serialize(currentTransfers)
    );

    let nextYear = currentYear;
    let nextMonthNum = currentMonthNum + 1;
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

    const carryBalance = Boolean(options.carryBalance);
    const rolloverUnpaidItems = Boolean(options.rolloverUnpaidOneTimeItems);

    // Rollover Opening Balance Reconciliation:
    // If unpaid one-time items are rolling forward into the next month, add back their amounts so they aren't double-deducted
    const unpaidOneTimeItems = rolloverUnpaidItems
      ? currentItems.filter((i) => i.type === 'one-time' && i.isPaid === false)
      : [];

    const unpaidTotalAddBack = unpaidOneTimeItems.reduce((acc, it) => acc + Number(it.amount || 0), 0);
    const unpaidAccountAddBack = {};
    for (const it of unpaidOneTimeItems) {
      if (it.accountId) {
        unpaidAccountAddBack[it.accountId] = (unpaidAccountAddBack[it.accountId] || 0) + Number(it.amount || 0);
      }
    }

    const baseEndingBalance = Number(currentSimulation.endingBalance || 0);
    const newOpeningBalance = carryBalance ? (baseEndingBalance + unpaidTotalAddBack) : 0;

    const nextAccountOpeningBalances = (carryBalance && Array.isArray(currentSimulation.accountSummaries))
      ? currentSimulation.accountSummaries.map((sm) => {
          const addBack = unpaidAccountAddBack[sm.id] || 0;
          return {
            accountId: sm.id,
            amount: Number(sm.endingBalance || 0) + addBack
          };
        })
      : [];

    let nextIncomeCreditDate = null;
    if (currentMonth.incomeCreditDate) {
      const dayPart = currentMonth.incomeCreditDate.split('-')[2] || '01';
      nextIncomeCreditDate = `${nextYear}-${pad(nextMonthNum)}-${dayPart}`;
    }

    if (!nextMonth) {
      const [createdMonth] = await db.insert(s.months).values({
        userId,
        year: nextYear,
        month: nextMonthNum,
        openingBalance: newOpeningBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: nextIncomeCreditDate,
        salaryAccountId: currentMonth.salaryAccountId || null,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol
      }).returning();

      for (const op of nextAccountOpeningBalances) {
        await db.insert(s.monthAccountOpenings).values({
          monthId: createdMonth.id,
          accountId: op.accountId,
          amount: op.amount
        });
      }
      nextMonth = await attachAccountOpeningsToMonth(createdMonth);
    } else if (carryBalance) {
      await db.update(s.months)
        .set({
          openingBalance: newOpeningBalance,
          salaryAccountId: currentMonth.salaryAccountId || nextMonth.salaryAccountId,
          updatedAt: new Date()
        })
        .where(eq(s.months.id, nextMonth.id));

      await db.delete(s.monthAccountOpenings).where(eq(s.monthAccountOpenings.monthId, nextMonth.id));
      for (const op of nextAccountOpeningBalances) {
        await db.insert(s.monthAccountOpenings).values({
          monthId: nextMonth.id,
          accountId: op.accountId,
          amount: op.amount
        });
      }
      nextMonth = await attachAccountOpeningsToMonth(nextMonth);
    }

    // Copy FIXED recurring items
    const recurringItems = currentItems.filter((i) => i.type === 'recurring' && i.isFixed === true);
    const existingNextItems = await db.query.items.findMany({
      where: and(
        eq(s.items.userId, userId),
        eq(s.items.monthId, nextMonth.id),
        eq(s.items.type, 'recurring')
      )
    });

    const existingNames = new Set(existingNextItems.map((i) => `${i.name}-${i.date}`));

    for (const item of recurringItems) {
      const dayPart = item.date ? item.date.split('-')[2] : '01';
      const nextDate = `${nextYear}-${pad(nextMonthNum)}-${dayPart}`;
      if (!existingNames.has(`${item.name}-${nextDate}`)) {
        await db.insert(s.items).values({
          userId,
          monthId: nextMonth.id,
          type: 'recurring',
          name: item.name,
          category: item.category || 'General',
          priority: item.priority,
          amount: item.amount,
          date: nextDate,
          isFixed: true,
          isPaid: false,
          accountId: item.accountId || null
        });
      }
    }

    // Rollover unpaid one-time items if requested
    if (Boolean(options.rolloverUnpaidOneTimeItems)) {
      const unpaidOneTimeItems = currentItems.filter((i) => i.type === 'one-time' && i.isPaid === false);
      for (const item of unpaidOneTimeItems) {
        const dayPart = item.date ? item.date.split('-')[2] : '01';
        const nextDate = `${nextYear}-${pad(nextMonthNum)}-${pad(Math.min(28, parseInt(dayPart, 10) || 1))}`;
        await db.insert(s.items).values({
          userId,
          monthId: nextMonth.id,
          type: 'one-time',
          name: item.name,
          category: item.category || 'General',
          priority: item.priority,
          amount: item.amount,
          date: nextDate,
          isPaid: false,
          accountId: item.accountId || null
        });
      }
    }

    const allNextItems = await db.query.items.findMany({
      where: and(eq(s.items.userId, userId), eq(s.items.monthId, nextMonth.id))
    });

    const nextSimulation = simulate(
      {
        openingBalance: nextMonth.openingBalance,
        incomeAmount: nextMonth.incomeAmount,
        incomeCreditDate: nextMonth.incomeCreditDate,
        incomeCreditDay: nextMonth.incomeCreditDate ? parseInt(nextMonth.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: nextMonth.salaryAccountId,
        safetyFloor: nextMonth.safetyFloor,
        unplannedAllowance: nextMonth.unplannedAllowance || 0,
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: nextMonth.accountOpeningBalances || [],
        transfers: []
      },
      serialize(allNextItems),
      { year: nextYear, month: nextMonthNum },
      [],
      [],
      []
    );

    return {
      month: serialize(nextMonth),
      items: serialize(allNextItems),
      simulation: nextSimulation
    };
  },

  /**
   * Deletes a month and all cascaded children.
   */
  async deleteMonth(userId, year, monthNum, force = false) {
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && monthNum === (now.getMonth() + 1);
    if (isCurrentMonth && !force) {
      throw new ValidationError('Deleting the current active month requires explicit confirmation (?force=true)');
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

    if (month.isClosed) {
      throw new ValidationError('Cannot delete a closed review period. Review periods are strictly read-only archives.');
    }

    // Terminal-Only Month Deletion:
    // User can only delete the latest month (to roll back) or earliest month (to prune tail history).
    const allUserMonths = await db.query.months.findMany({
      where: eq(s.months.userId, userId),
      orderBy: [asc(s.months.year), asc(s.months.month)]
    });

    if (allUserMonths.length > 2) {
      const earliest = allUserMonths[0];
      const latest = allUserMonths[allUserMonths.length - 1];
      const isEarliest = earliest.year === year && earliest.month === monthNum;
      const isLatest = latest.year === year && latest.month === monthNum;
      if (!isEarliest && !isLatest) {
        throw new ValidationError('Cannot delete an intermediate past month. Only the latest month (to roll back) or the earliest month (to prune history) may be deleted.');
      }
    }

    await db.delete(s.months).where(eq(s.months.id, month.id));

    return {
      message: 'Month and all associated items deleted successfully',
      deleted: { year, month: monthNum }
    };
  },

  /**
   * Recommends purchase date against cashflow.
   */
  async recommendPurchaseDate(userId, year, monthNum, rawAmt, fundingSource = null, clientDay = null) {
    const amount = Number(rawAmt);
    if (!rawAmt || isNaN(amount) || amount <= 0) {
      throw new ValidationError('Valid positive amount is required');
    }

    const rawMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });
    if (!rawMonth) throw new NotFoundError(`Month ${year}-${monthNum} not found`);

    const month = await attachAccountOpeningsToMonth(rawMonth);

    const [items, transactions, transfers, allAccounts] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) }),
      db.query.transfers.findMany({ where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id)) }),
      db.query.accounts.findMany({ where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)) })
    ]);

    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = (typeof clientDay === 'number' && clientDay >= 1) ? Math.floor(clientDay) : (isCurrentMonth ? now.getDate() : 0);

    return engineRecommendDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        salaryBankAccountId: month.salaryAccountId,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts: serialize(bankAccounts), wallets: serialize(wallets) },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers: serialize(transfers)
      },
      serialize(items),
      { year, month: monthNum },
      amount,
      serialize(transactions),
      [],
      serialize(transfers),
      fundingSource || null
    );
  }
};
