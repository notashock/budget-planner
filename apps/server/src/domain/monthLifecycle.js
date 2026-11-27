import { eq, and, desc, asc, or, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { simulate, recommendPurchaseDate as engineRecommendDate, deriveTransactionState, isFuturePeriod } from '@budget/engine';
import { validateUserAccount } from '../services/accountValidation.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';
import { SimulationService, loadGoalsForUser } from './simulationService.js';
import { PersonFundService } from './personFundService.js';
import { CardService } from './cardService.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';
import { loadAccountTypeMap, attachAccountTypes } from '../utils/accountTypes.js';
import { pad, getTodayIso, isHistoricalPastMonth, attachAccountOpeningsToMonth, salaryTxCondition } from './monthHelpers.js';
import { MonthTransitions } from './monthTransitions.js';
import { localNow } from '../utils/clock.js';

// Re-exported for existing importers
export { isHistoricalPastMonth, attachAccountOpeningsToMonth } from './monthHelpers.js';

/**
 * MonthLifecycle Domain Service
 */
export const MonthLifecycle = {
  /**
   * Reconciles prematurely closed current months and prunes unpopulated ghost future months.
   */
  async reconcileAndPruneMonths(userId) {
    const todayIso = getTodayIso();
    const now = localNow();
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
        // A salary cycle named after this month can end before today while the next
        // cycle (named after next month) already covers today: leave that one alone.
        const coveredByAnother = allMonths.some((o) => o.id !== m.id && o.startDate && o.endDate
          && o.startDate <= todayIso && o.endDate >= todayIso);
        if (!m.endDate || (m.endDate < todayIso && !coveredByAnother) || (m.startDate && m.endDate < m.startDate)) {
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
      const isFuture = isFuturePeriod(m, todayIso);

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
    // Parallelize month header lookup and user account discovery
    const [rawMonth, allAccounts] = await Promise.all([
      db.query.months.findFirst({
        where: and(
          eq(s.months.userId, userId),
          eq(s.months.year, year),
          eq(s.months.month, monthNum)
        )
      }),
      db.query.accounts.findMany({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)),
        orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
      })
    ]);

    if (!rawMonth) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    const month = await attachAccountOpeningsToMonth(rawMonth);
    const bankAccounts = allAccounts.filter(a => a.type === 'bank');
    const wallets = allAccounts.filter(a => a.type === 'wallet');

    // Reads never write: a month without a salary account shows the primary one, without saving it
    const cashAccounts = allAccounts.filter(a => a.type !== 'credit_card');
    if (!month.salaryAccountId && cashAccounts.length > 0) {
      month.salaryAccountId = (cashAccounts.find(b => b.isPrimary) || cashAccounts[0]).id;
    }

    const [rawItems, untypedTransactions, rawTransfers, userSettings, accountTypes] = await Promise.all([
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
      }),
      loadAccountTypeMap(userId)
    ]);
    // Real account types for the accountType / sourceType / destinationType fields
    const items = attachAccountTypes(rawItems, accountTypes);
    const rawTransactions = attachAccountTypes(untypedTransactions, accountTypes);
    const transfers = attachAccountTypes(rawTransfers, accountTypes);

    const now = localNow();
    const dueWindowDays = userSettings?.dueWindowDays || 3;
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Bridge any items from s.items not yet represented in s.transactions
    const existingTxItemIds = new Set(
      rawTransactions.map(t => String(t.plannedItemId || t.legacyItemId || t.id)).filter(Boolean)
    );

    const bridgedPlannedTxs = items
      .filter(it => !existingTxItemIds.has(String(it.id)))
      .map(it => ({
        id: it.id,
        _id: it.id,
        userId: it.userId,
        monthId: it.monthId,
        name: it.name,
        status: it.isPaid ? 'successful' : 'planned',
        origin: 'planned',
        amount: it.amount,
        date: it.date,
        plannedAmount: it.amount,
        plannedDate: it.date,
        category: it.category || 'General',
        note: '',
        isIncome: Boolean(it.isIncome),
        accountId: it.accountId,
        accountType: it.accountType,
        legacyItemId: it.id,
        plannedItemId: it.isPaid ? it.id : null,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt
      }));

    const combinedTransactions = [...rawTransactions, ...bridgedPlannedTxs];

    const transactions = combinedTransactions.map((tx) => ({
      ...tx,
      derivedStatus: deriveTransactionState(tx, todayStr, dueWindowDays)
    }));
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = year * 12 + monthNum;

    let currentDay = null;
    if (month.startDate && month.endDate) {
      // By the period's dates: a salary cycle can be named after the next month
      if (month.startDate > todayStr) currentDay = 0;
      else if (month.endDate >= todayStr) currentDay = now.getDate();
    } else if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null;
    } else {
      currentDay = 0;
    }

    const [goals, heldContext, cardContext] = await Promise.all([
      loadGoalsForUser(userId),
      PersonFundService.getSimulationContext(userId, month),
      CardService.getSimulationContext(userId, month)
    ]);
    const { simulation, accountSimulations } = SimulationService.computeSimulation({
      month,
      bankAccounts,
      wallets,
      accountOpenings: month.accountOpeningBalances || [],
      items,
      transactions,
      transfers,
      goals,
      currentDay,
      heldContext,
      cardContext
    });

    // The engine's result also carries `allEvents` (the same array as `events`)
    // and `accountSimulations` (sent once, at the top level). In JSON each would
    // be a full second copy, so neither is sent (mobile upgrade plan, Phase 2).
    const { allEvents: _sameAsEvents, accountSimulations: _sentAtTopLevel, ...simulationBody } = simulation;

    return {
      creditCards: cardContext.creditCards,
      month: serialize(month),
      items: serialize(items),
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      bankAccounts: serialize(bankAccounts),
      wallets: serialize(wallets),
      simulation: simulationBody,
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
      if (validSalaryBank.type === 'credit_card') {
        throw new ValidationError('Salary cannot be paid into a credit card');
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
        if (validSalary.type === 'credit_card') {
          throw new ValidationError('Salary cannot be paid into a credit card');
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
        const now = localNow();
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

    const now = localNow();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : null;

    const goalsForSim = await loadGoalsForUser(userId);
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
      goalsForSim,
      serialize(transfers)
    );

    let advancedMonth = null;
    if (update.isSalaryCredited) {
      const creditDate = update.salaryCreditedDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      let salaryTx = await db.query.transactions.findFirst({
        where: and(
          eq(s.transactions.userId, userId),
          eq(s.transactions.monthId, month.id),
          salaryTxCondition()
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
   * Deletes a month and all cascaded children.
   */
  async deleteMonth(userId, year, monthNum, force = false) {
    const now = localNow();
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

    const now = localNow();
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
  },

  // Salary credit and rollover live in monthTransitions.js
  ...MonthTransitions
};
