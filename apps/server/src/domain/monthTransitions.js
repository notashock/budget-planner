import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { simulate, getSalaryWindowStatus } from '@budget/engine';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';
import { loadGoalsForUser } from './simulationService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';
import { pad, attachAccountOpeningsToMonth, salaryTxCondition } from './monthHelpers.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { getSalaryWindow, assertInWindow } from './salaryWindow.js';
import { localNow } from '../utils/clock.js';

/**
 * Month transitions: crediting the salary and rolling over to the next month.
 * Merged into MonthLifecycle, so callers use MonthLifecycle.<method>().
 */
export const MonthTransitions = {
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

    // The next salary goes in its window: payday ± 5 days after the last one (a late one is confirmed).
    // The first salary, logged at setup, has no window.
    const win = await getSalaryWindow(userId);
    if (win) assertInWindow(win, options.date || win.today, Boolean(options.late));

    // This cycle's salary is already in: a new credit is the next payday's salary
    if (rawMonth.isSalaryCredited) {
      const template = await SalaryTemplateService.getActiveTemplate(userId);
      if (template?.periodType === 'salary_cycle') {
        return this.creditNextCycleSalary(userId, rawMonth, template, options);
      }
    }

    const month = await attachAccountOpeningsToMonth(rawMonth);

    const now = localNow();
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
        salaryTxCondition()
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
        name: 'Monthly Salary',
        origin: 'salary',
        status: 'successful',
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
      })
    ]);

    const goalsForSim = await loadGoalsForUser(userId);
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
      goalsForSim,
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
   * The next payday's salary on a salary cycle whose own salary is already in:
   * the cycle ends the day before it, the next cycle starts on it and holds it.
   * It can arrive up to 10 days early (a payday on a weekend or holiday).
   */
  async creditNextCycleSalary(userId, month, template, options = {}) {
    if (!month.endDate) throw new ValidationError('This cycle has no end date, so the next payday is unknown');
    const now = localNow();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const date = options.date || todayStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('Salary date must be YYYY-MM-DD');

    // creditSalary has checked the date against the salary window
    const lastCredit = month.salaryCreditedDate || month.incomeCreditDate || month.startDate;
    if (lastCredit && date <= lastCredit) throw new ValidationError("This cycle's salary is already logged on a later date");
    if (date > todayStr) throw new ValidationError('A salary cannot be logged before it arrives');

    const amount = Math.round(Number(options.amount || template.amount || month.incomeAmount || 0));
    if (!(amount > 0)) throw new ValidationError('A positive salary amount is required');

    const accountId = options.bankAccountId || options.accountId || template.receivingAccountId || month.salaryAccountId;
    if (!accountId) throw new ValidationError('Choose the account the salary was paid into');
    const account = await validateUserAccount({ userId, accountId });
    if (!account) throw new ValidationError('Choose one of your own accounts for the salary');
    if (account.type === 'credit_card') throw new ValidationError('Salary cannot be paid into a credit card');

    // Close this cycle the day before and open the next one on the salary date
    const advance = await SalaryTemplateService.onSalaryCredited(
      userId, { monthId: month.id, amount: month.incomeAmount }, date, { advance: true }
    );
    const next = advance?.nextMonth;
    if (!next?.id) throw new ValidationError('Could not start the next salary cycle');

    const [transaction] = await db.insert(s.transactions).values({
      userId,
      monthId: next.id,
      amount,
      date,
      name: 'Monthly Salary',
      origin: 'salary',
      status: 'successful',
      note: 'Monthly Salary',
      category: 'Salary',
      accountId,
      isIncome: true
    }).returning();

    const [credited] = await db.update(s.months)
      .set({ isSalaryCredited: true, salaryCreditedDate: date, incomeAmount: amount, salaryAccountId: accountId, updatedAt: new Date() })
      .where(eq(s.months.id, next.id))
      .returning();

    const closed = await db.query.months.findFirst({ where: eq(s.months.id, month.id) });
    return {
      success: true,
      month: serialize(await attachAccountOpeningsToMonth(closed)),
      advancedMonth: serialize(await attachAccountOpeningsToMonth(credited)),
      transaction: serialize(transaction),
      // What the new cycle got from this one's plans
      carried: {
        moved: serialize(advance.carried?.moved || []),
        dropped: serialize(advance.carried?.dropped || []),
        repeated: serialize(advance.carried?.repeated || [])
      }
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

    const rolloverGoals = await loadGoalsForUser(userId);
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
      rolloverGoals,
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
      rolloverGoals,
      []
    );

    return {
      month: serialize(nextMonth),
      items: serialize(allNextItems),
      simulation: nextSimulation
    };
  }
};
