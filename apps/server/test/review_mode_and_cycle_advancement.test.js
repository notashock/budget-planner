import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { migrateReviewModeAndClosedMonths } from '../src/scripts/migrate_review_mode_and_closed_months.js';

describe('Continuous Tracking & Read-Only Review Mode Integration Suite', () => {
  let app;
  let testUser;
  let authToken;
  let primaryAccountId;
  let cashAccountId;
  let activeMonth;

  beforeAll(async () => {
    app = createApp();
    await migrateReviewModeAndClosedMonths();

    // Register test user
    const email = `review_mode_test_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!' });

    expect(regRes.status).toBe(201);
    authToken = regRes.body.data.token;
    testUser = regRes.body.data.user;

    // Create primary bank account
    const bankRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Salary Checking',
        type: 'bank',
        accountType: 'savings',
        openingBalance: 100000,
        openingBalanceDate: '2026-11-01',
        isPrimary: true
      });
    expect(bankRes.status).toBe(201);
    primaryAccountId = bankRes.body.data.id;

    // Create cash account
    const cashRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Pocket Cash',
        type: 'cash',
        accountType: 'cash',
        openingBalance: 5000,
        openingBalanceDate: '2026-11-01'
      });
    expect(cashRes.status).toBe(201);
    cashAccountId = cashRes.body.data.id;

    // Save salary template
    const templateRes = await request(app)
      .post('/api/salary-templates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 80000,
        expectedCreditDay: 28,
        receivingAccountId: primaryAccountId,
        periodType: 'calendar_month',
        effectiveDate: '2026-11-28'
      });
    expect(templateRes.status).toBe(201);
  });

  it('1. Verifies continuous horizon provisioning and planned salary transaction', async () => {
    const monthsRes = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${authToken}`);

    expect(monthsRes.status).toBe(200);
    expect(monthsRes.body.data.length).toBeGreaterThanOrEqual(1);

    activeMonth = monthsRes.body.data.find(m => m.year === 2026 && m.month === 11) || monthsRes.body.data[0];
    expect(activeMonth).toBeDefined();
    expect(activeMonth.isClosed).toBe(false);

    // Get transactions for active month
    const txRes = await request(app)
      .get(`/api/months/${activeMonth.year}/${activeMonth.month}/transactions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(txRes.status).toBe(200);
    const salaryTx = txRes.body.data.find(t => t.origin === 'salary');
    expect(salaryTx).toBeUndefined();
    expect(activeMonth.incomeAmount).toBe(80000);
  });

  it('2. Records an expense and settles salary: advances cycle, snapshots closing balances, closes month', async () => {
    // Record an expense before closing
    const expenseRes = await request(app)
      .post(`/api/months/${activeMonth.year}/${activeMonth.month}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Groceries',
        amount: 15000,
        date: `${activeMonth.year}-${String(activeMonth.month).padStart(2, '0')}-05`,
        origin: 'spot',
        status: 'successful',
        accountId: primaryAccountId,
        category: 'Food'
      });
    expect(expenseRes.status).toBe(201);

    // Settle salary via POST /api/months/:year/:month/credit-salary (Rule 1)
    const payRes = await request(app)
      .post(`/api/months/${activeMonth.year}/${activeMonth.month}/credit-salary`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 80000,
        date: '2026-11-28',
        accountId: primaryAccountId
      });

    expect(payRes.status).toBe(200);

    // Verify month is now closed and closing balances snapshotted
    const closedMonthRes = await request(app)
      .get(`/api/months/${activeMonth.year}/${activeMonth.month}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(closedMonthRes.status).toBe(200);
    const monthData = closedMonthRes.body.data.month;
    expect(monthData.isClosed).toBe(true);
    expect(monthData.closedAt).toBeTruthy();
    expect(monthData.closingBalances).toBeDefined();

    // Opening was 100,000 + 80,000 salary - 15,000 expense = 165,000 closing balance
    const bankSnapshot = monthData.closingBalances[primaryAccountId];
    expect(bankSnapshot).toBeDefined();
    expect(bankSnapshot.openingBalance).toBe(100000);
    expect(bankSnapshot.closingBalance).toBe(165000);
    expect(bankSnapshot.totalInflow).toBe(80000);
    expect(bankSnapshot.totalOutflow).toBe(15000);

    // Pocket Cash had no transactions: closing balance remains 5000
    const cashSnapshot = monthData.closingBalances[cashAccountId];
    expect(cashSnapshot).toBeDefined();
    expect(cashSnapshot.closingBalance).toBe(5000);
  });

  it('3. Rejects transaction mutations in a closed review period', async () => {
    // 3a. Record transaction in closed period
    const addRes = await request(app)
      .post(`/api/months/${activeMonth.year}/${activeMonth.month}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Late Expense',
        amount: 2000,
        date: '2026-10-10',
        origin: 'spot',
        status: 'successful',
        accountId: primaryAccountId
      });
    expect(addRes.status).toBe(400);
    expect(addRes.body.error?.message || addRes.body.message).toMatch(/closed review period/i);

    // 3b. Global transaction dated within closed period
    const globalRes = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Backdated Global Expense',
        amount: 3000,
        date: activeMonth.startDate || '2026-11-01',
        origin: 'spot',
        accountId: primaryAccountId
      });
    expect(globalRes.status).toBe(400);
    expect(globalRes.body.error?.message || globalRes.body.message).toMatch(/closed review period/i);

    // Find an existing transaction in the closed month
    const txRes = await request(app)
      .get(`/api/months/${activeMonth.year}/${activeMonth.month}/transactions`)
      .set('Authorization', `Bearer ${authToken}`);
    const existingTx = txRes.body.data[0];
    expect(existingTx).toBeDefined();

    // 3c. Update transaction in closed month
    const updateTxRes = await request(app)
      .put(`/api/transactions/${existingTx.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 9999 });
    expect(updateTxRes.status).toBe(400);
    expect(updateTxRes.body.error?.message || updateTxRes.body.message).toMatch(/closed review period/i);

    // 3d. Delete transaction in closed month
    const delTxRes = await request(app)
      .delete(`/api/transactions/${existingTx.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(delTxRes.status).toBe(400);
    expect(delTxRes.body.error?.message || delTxRes.body.message).toMatch(/closed review period/i);
  });

  it('4. Rejects month mutations (update, credit salary, delete) in closed review period', async () => {
    // 4a. Update month settings
    const updateMonthRes = await request(app)
      .put(`/api/months/${activeMonth.year}/${activeMonth.month}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ safetyFloor: 50000 });
    expect(updateMonthRes.status).toBe(400);
    expect(updateMonthRes.body.error?.message || updateMonthRes.body.message).toMatch(/closed review period/i);

    // 4b. Credit salary on closed month
    const creditSalaryRes = await request(app)
      .post(`/api/months/${activeMonth.year}/${activeMonth.month}/credit-salary`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 80000 });
    expect(creditSalaryRes.status).toBe(400);
    expect(creditSalaryRes.body.error?.message || creditSalaryRes.body.message).toMatch(/closed review period/i);

    // 4c. Delete closed month
    const deleteMonthRes = await request(app)
      .delete(`/api/months/${activeMonth.year}/${activeMonth.month}?force=true`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(deleteMonthRes.status).toBe(400);
    expect(deleteMonthRes.body.error?.message || deleteMonthRes.body.message).toMatch(/closed review period/i);
  });

  it('5. Allows reading/reviewing the closed period archive in full detail', async () => {
    const reviewRes = await request(app)
      .get(`/api/months/${activeMonth.year}/${activeMonth.month}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.month.isClosed).toBe(true);
    expect(reviewRes.body.data.transactions.length).toBeGreaterThanOrEqual(1);
    expect(reviewRes.body.data.month.closingBalances).toBeTruthy();
  });
});
