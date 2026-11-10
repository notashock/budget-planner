import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { migrateMonthDecouplingAndIncomeModel } from '../src/scripts/migrate_month_decoupling_and_income_model.js';

describe('Onboarding & Dual-Income Model Integration Suite', () => {
  let app;
  let testUser;
  let authToken;

  beforeAll(async () => {
    app = createApp();
    await migrateMonthDecouplingAndIncomeModel();

    // Create unique test user
    const email = `onboarding_test_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!' });

    expect(regRes.status).toBe(201);
    expect(regRes.body.status).toBe('success');
    authToken = regRes.body.data.token;
    testUser = regRes.body.data.user;
  });

  it('1. Mandatory account creation with openingBalanceDate and cash/bank types', async () => {
    // Attempting to query accounts initially returns 0 accounts
    const initialRes = await request(app)
      .get('/api/accounts/all')
      .set('Authorization', `Bearer ${authToken}`);

    expect(initialRes.status).toBe(200);
    expect(initialRes.body.data).toHaveLength(0);

    // Create primary bank account with opening balance and opening balance date
    const bankRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'HDFC Savings',
        type: 'bank',
        accountType: 'savings',
        openingBalance: 150000,
        openingBalanceDate: '2026-10-01',
        isPrimary: true
      });

    expect(bankRes.status).toBe(201);
    expect(bankRes.body.data.name).toBe('HDFC Savings');
    expect(bankRes.body.data.openingBalanceDate).toBe('2026-10-01');
    expect(bankRes.body.data.isPrimary).toBe(true);

    // Create Cash account
    const cashRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Cash In Hand',
        type: 'cash',
        accountType: 'cash',
        openingBalance: 20000,
        openingBalanceDate: '2026-10-01'
      });

    expect(cashRes.status).toBe(201);
    expect(cashRes.body.data.type).toBe('cash');
    expect(cashRes.body.data.openingBalanceDate).toBe('2026-10-01');

    // Verify both accounts are returned in /api/accounts/all
    const allAccountsRes = await request(app)
      .get('/api/accounts/all')
      .set('Authorization', `Bearer ${authToken}`);

    expect(allAccountsRes.status).toBe(200);
    expect(allAccountsRes.body.data).toHaveLength(2);
  });

  it('2. Provisions salary template, rolling 2 periods, and planned salary transactions', async () => {
    const accountsRes = await request(app)
      .get('/api/accounts/all')
      .set('Authorization', `Bearer ${authToken}`);

    const primaryBank = accountsRes.body.data.find((a) => a.isPrimary);
    expect(primaryBank).toBeDefined();

    // Setup salary template: 80,000 INR on the 25th of each month
    const templateRes = await request(app)
      .post('/api/salary-templates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 80000,
        expectedCreditDay: 25,
        receivingAccountId: primaryBank.id,
        periodType: 'calendar_month',
        effectiveDate: '2026-10-01'
      });

    expect(templateRes.status).toBe(201);
    expect(templateRes.body.status).toBe('success');
    expect(templateRes.body.data.amount).toBe(80000);
    expect(templateRes.body.data.expectedCreditDay).toBe(25);
    expect(templateRes.body.data.version).toBe(1);

    // Verify settings updated
    const settingsRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(settingsRes.body.data.incomeMode).toBe('salary');
    expect(settingsRes.body.data.defaultIncomeAmount).toBe(80000);

    // Verify active period created (Just-In-Time per ADR 0066)
    const monthsRes = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${authToken}`);

    expect(monthsRes.status).toBe(200);
    expect(monthsRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Check active month metadata has salary marker (Rule 1: No planned salary in ledger)
    const targetMonth = monthsRes.body.data[0];

    const txRes = await request(app)
      .get(`/api/months/${targetMonth.year}/${targetMonth.month}/transactions`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(txRes.status).toBe(200);
    const salaryTx = txRes.body.data.find((t) => t.origin === 'salary');
    expect(salaryTx).toBeUndefined();
    expect(targetMonth.incomeAmount).toBe(80000);

    // Test settling salary: 1-click credit salary
    const payRes = await request(app)
      .post(`/api/months/${targetMonth.year}/${targetMonth.month}/credit-salary`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 82000, // received bonus
        date: `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-25`
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.month.isSalaryCredited).toBe(true);
    expect(payRes.body.data.month.incomeAmount).toBe(82000);
  });

  it('3. Versions salary template on change and preserves past transactions', async () => {
    const accountsRes = await request(app)
      .get('/api/accounts/all')
      .set('Authorization', `Bearer ${authToken}`);
    const primaryBank = accountsRes.body.data.find((a) => a.isPrimary);

    // Update salary: raise to 95,000
    const updateRes = await request(app)
      .post('/api/salary-templates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 95000,
        expectedCreditDay: 25,
        receivingAccountId: primaryBank.id,
        periodType: 'calendar_month',
        effectiveDate: '2026-11-01'
      });

    expect(updateRes.status).toBe(201);
    expect(updateRes.body.data.version).toBe(2);
    expect(updateRes.body.data.amount).toBe(95000);

    // Deactivate salary template
    const deactRes = await request(app)
      .post('/api/salary-templates/deactivate')
      .set('Authorization', `Bearer ${authToken}`);

    expect(deactRes.status).toBe(200);

    // Settings switched to irregular without deleting history
    const settingsRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${authToken}`);
    expect(settingsRes.body.data.incomeMode).toBe('irregular');
  });

  it('4. Global/irregular transactions & reports operate fully without months', async () => {
    // Create new irregular earner user with 0 months
    const irregularEmail = `freelancer_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: irregularEmail, password: 'Password123!' });

    const irregularToken = regRes.body.data.token;

    // Step 1: Create bank account with opening balance
    const accRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Freelance Business Account',
        type: 'bank',
        openingBalance: 100000,
        openingBalanceDate: '2026-01-01',
        isPrimary: true
      });
    const accId = accRes.body.data.id;

    // Set incomeMode to irregular
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({ incomeMode: 'irregular' });

    // Ensure 0 months exist for this user
    const monthsRes = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${irregularToken}`);
    expect(monthsRes.body.data).toHaveLength(0);

    // Log three irregular income transactions months apart
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Website Redesign Project',
        amount: 60000,
        date: '2026-02-15',
        isIncome: true,
        accountId: accId,
        status: 'successful'
      });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Brand Identity Retainer',
        amount: 40000,
        date: '2026-05-20',
        isIncome: true,
        accountId: accId,
        status: 'successful'
      });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Mobile App Architecture Sprint',
        amount: 80000,
        date: '2026-08-10',
        isIncome: true,
        accountId: accId,
        status: 'successful'
      });

    // Log spending transactions
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Figma & Cloud Tools',
        amount: 30000,
        date: '2026-03-01',
        isIncome: false,
        accountId: accId,
        status: 'successful'
      });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'MacBook Hardware Repair',
        amount: 45000,
        date: '2026-06-15',
        isIncome: false,
        accountId: accId,
        status: 'successful'
      });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`)
      .send({
        name: 'Health & Office Insurance',
        amount: 25000,
        date: '2026-09-01',
        isIncome: false,
        accountId: accId,
        status: 'successful'
      });

    // Verify global transactions endpoint returns all 6 transactions without a month
    const listRes = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${irregularToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(6);

    // Verify /api/reports/irregular produces accurate hand-calculated metrics
    const reportRes = await request(app)
      .get('/api/reports/irregular?asOfDate=2026-10-20')
      .set('Authorization', `Bearer ${irregularToken}`);

    expect(reportRes.status).toBe(200);
    const report = reportRes.body.data;
    expect(report.trailing12mIncome).toBe(180000);
    expect(report.smoothedMonthlyIncome).toBe(15000);
    expect(report.trailing12mSpending).toBe(100000);
    expect(report.avgMonthlySpending).toBe(8333);
    expect(report.currentBalance).toBe(180000);
    expect(report.runwayMonths).toBe(21.6);
    expect(report.runwayDisplay).toBe('21.6 mo');
    expect(report.isIndefinite).toBe(false);
    expect(report.quarterly).toHaveLength(3);
    expect(report.yearly).toHaveLength(1);
  });
});
