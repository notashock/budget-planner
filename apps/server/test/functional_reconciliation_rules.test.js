import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { SalaryCycleJob } from '../src/services/salaryCycleJob.js';
import { SalaryTemplateService } from '../src/services/salaryTemplateService.js';
import { BudgetExecution } from '../src/domain/budgetExecution.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

describe('Functional Reconciliation Rules Test Suite', () => {
  let app;
  let testUser;
  let authToken;
  let primaryAccountId;

  beforeAll(async () => {
    app = createApp();

    const email = `func_test_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!' });

    expect(regRes.status).toBe(201);
    authToken = regRes.body.data.token;
    testUser = regRes.body.data.user;

    const bankRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'HDFC Main Checking',
        type: 'bank',
        accountType: 'savings',
        openingBalance: 5000000, // ₹50,000
        minimumBalance: 1000000, // ₹10,000 floor
        isPrimary: true
      });
    expect(bankRes.status).toBe(201);
    primaryAccountId = bankRes.body.data.id;
  });

  it('Rule 1 (TC-ONB-02): Creating salary template stores metadata without creating planned salary transaction in ledger', async () => {
    const tmplRes = await request(app)
      .post('/api/salary-templates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 8000000, // ₹80,000
        expectedCreditDay: 1,
        receivingAccountId: primaryAccountId,
        periodType: 'calendar_month'
      });

    expect(tmplRes.status).toBe(201);

    // Verify month was provisioned
    const openMonths = await db.query.months.findMany({
      where: eq(s.months.userId, testUser.id)
    });
    expect(openMonths.length).toBeGreaterThanOrEqual(1);
    const activeMonth = openMonths[0];
    expect(activeMonth.incomeAmount).toBe(8000000);
    expect(activeMonth.salaryAccountId).toBe(primaryAccountId);

    // Verify ZERO planned salary transactions exist in transactions table
    const salaryTxs = await db.query.transactions.findMany({
      where: and(
        eq(s.transactions.userId, testUser.id),
        eq(s.transactions.origin, 'salary')
      )
    });
    expect(salaryTxs.length).toBe(0);
  });

  it('Rule 3 (TC-LFC-04): Unsettled planned commitments roll forward into next month on cycle advancement', async () => {
    const [month] = await db.query.months.findMany({
      where: and(eq(s.months.userId, testUser.id), eq(s.months.isClosed, false)),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });
    expect(month).toBeDefined();

    const plannedDateStr = `${month.year}-${pad(month.month)}-15`;

    // Create an unsettled planned expense in this month
    const [plannedTx] = await db.insert(s.transactions).values({
      userId: testUser.id,
      monthId: month.id,
      name: 'Internet Broadband Bill',
      status: 'planned',
      origin: 'planned',
      amount: 150000,
      plannedAmount: 150000,
      date: plannedDateStr,
      plannedDate: plannedDateStr,
      category: 'Utilities',
      accountId: primaryAccountId
    }).returning();

    expect(plannedTx.monthId).toBe(month.id);

    // Create mock salary credit transaction to trigger onSalaryCredited
    const [salaryCreditTx] = await db.insert(s.transactions).values({
      userId: testUser.id,
      monthId: month.id,
      name: 'Monthly Salary Credit',
      status: 'successful',
      origin: 'salary',
      amount: 8000000,
      date: `${month.year}-${pad(month.month)}-20`,
      isIncome: true,
      category: 'Salary',
      accountId: primaryAccountId
    }).returning();

    // Advance cycle via SalaryTemplateService
    const advanceResult = await SalaryTemplateService.onSalaryCredited(testUser.id, salaryCreditTx, `${month.year}-${pad(month.month)}-20`);
    expect(advanceResult?.nextMonthId).toBeDefined();

    // Verify old month is closed
    const closedMonth = await db.query.months.findFirst({
      where: eq(s.months.id, month.id)
    });
    expect(closedMonth.isClosed).toBe(true);

    // Verify the planned commitment was automatically migrated to nextMonthId
    const migratedTx = await db.query.transactions.findFirst({
      where: eq(s.transactions.id, plannedTx.id)
    });
    expect(migratedTx.monthId).toBe(advanceResult.nextMonthId);
    expect(migratedTx.status).toBe('planned');
  });

  it('Rule 2 (TC-LFC-03): SalaryCycleJob autonomously advances cycle when linked salary date arrives', async () => {
    const [activeMonth] = await db.query.months.findMany({
      where: and(eq(s.months.userId, testUser.id), eq(s.months.isClosed, false)),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });
    expect(activeMonth).toBeDefined();

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Configure salary date as today so isDateArrived is true
    await db.update(s.months)
      .set({
        salaryAccountId: primaryAccountId,
        incomeCreditDate: todayIso,
        incomeAmount: 8000000,
        isSalaryCredited: false // NOT credited yet
      })
      .where(eq(s.months.id, activeMonth.id));

    // Run background SalaryCycleJob
    const advanced = await SalaryCycleJob.processUserSalaryCycles(testUser.id);
    expect(advanced).toBeDefined();
    expect(advanced.id).not.toBe(activeMonth.id);

    // Verify activeMonth is now closed
    const checkClosed = await db.query.months.findFirst({
      where: eq(s.months.id, activeMonth.id)
    });
    expect(checkClosed.isClosed).toBe(true);
    expect(checkClosed.isSalaryCredited).toBe(true);
  });

  it('Rule 5 (TC-GOAL-03): Autonomous Self-Healing Goal Revival restores deferred goals when cashflow improves', async () => {
    const [currentMonth] = await db.query.months.findMany({
      where: and(eq(s.months.userId, testUser.id), eq(s.months.isClosed, false)),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });
    expect(currentMonth).toBeDefined();

    // Set safety floor and opening balance with zero additional income
    await db.update(s.months)
      .set({ safetyFloor: 1000000, openingBalance: 5000000, incomeAmount: 0 })
      .where(eq(s.months.id, currentMonth.id));

    const freshMonth = await db.query.months.findFirst({
      where: eq(s.months.id, currentMonth.id)
    });

    // Create a purchase goal of ₹35,000 (buffer is 50,000 - 10,000 = 40,000)
    const [goal] = await db.insert(s.goals).values({
      userId: testUser.id,
      monthId: freshMonth.id,
      name: 'Sony Noise Cancelling Headphones',
      targetAmount: 3500000, // ₹35,000
      status: 'active',
      priority: 1
    }).returning();

    const txDate = `${freshMonth.year}-${pad(freshMonth.month)}-05`;

    // Log a massive expense of ₹45,000 that drops remaining cash to ₹5,000 (breaching safety buffer)
    const [bigDebit] = await db.insert(s.transactions).values({
      userId: testUser.id,
      monthId: freshMonth.id,
      name: 'Emergency Flight Ticket',
      status: 'successful',
      origin: 'spot',
      amount: 4500000,
      date: txDate,
      isIncome: false,
      accountId: primaryAccountId
    }).returning();

    // Trigger deferral check
    await BudgetExecution._reEvaluateAndDeferGoals(testUser.id, freshMonth);

    const deferredGoal = await db.query.goals.findFirst({
      where: eq(s.goals.id, goal.id)
    });
    expect(deferredGoal.status).toBe('deferred');
    expect(deferredGoal.deferredReason).toContain('Auto-deferred');

    // Now delete the massive expense via BudgetExecution.deleteTransaction
    await BudgetExecution.deleteTransaction(testUser.id, bigDebit.id);

    // Verify autonomous self-healing revival restored goal to 'active'
    const revivedGoal = await db.query.goals.findFirst({
      where: eq(s.goals.id, goal.id)
    });
    expect(revivedGoal.status).toBe('active');
    expect(revivedGoal.deferredReason).toBeNull();
  });
});
