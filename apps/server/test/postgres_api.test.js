import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('PostgreSQL Server API & Defensive Architecture Suite', () => {
  let app;
  let testUserId;
  let testUserEmail = `pg_test_${Date.now()}@example.com`;
  let authToken;
  let bankId;
  let walletId;
  let itemId;
  let monthId;

  beforeAll(async () => {
    await runMigrations();
    app = createApp({
      sessionSecret: 'test_secret_pg'
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(s.users).where(eq(s.users.id, testUserId));
    }
  });

  it('rejects unauthenticated requests to protected endpoints with structured error envelope', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('defensive core strictly intercepts and rejects malicious XSS payloads', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: '<script>alert("xss")</script>@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('MALICIOUS_INPUT_DETECTED');
    expect(res.body.error.message).toContain('cross-site scripting');
  });

  it('defensive core strictly blocks prototype pollution injection', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(JSON.parse('{"email": "pollute@example.com", "password": "password123", "__proto__": {"admin": true}}'));

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('MALICIOUS_INPUT_DETECTED');
    expect(res.body.error.message).toContain('prototype pollution');
  });

  it('registers a user, receives standard envelope with JWT, and initializes settings', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testUserEmail, password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.metadata).toBeDefined();
    expect(typeof res.body.metadata.durationMs).toBe('number');
    expect(res.body.metadata.path).toBeUndefined();
    expect(res.body.metadata.method).toBeUndefined();
    expect(res.body.data).toBeDefined();
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(testUserEmail);

    testUserId = res.body.data.user.id;
    authToken = res.body.data.token;

    // Check settings endpoint wrapped in standard envelope
    const settingsRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.status).toBe('success');
    expect(settingsRes.body.data.userId).toBe(testUserId);
    expect(settingsRes.body.data.currencySymbol).toBe('₹');
  });

  it('creates and manages accounts in PostgreSQL via standard envelope', async () => {
    const createBank = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'HDFC Salary',
        institution: 'HDFC',
        accountType: 'salary',
        openingBalance: 50000,
        minimumBalance: 10000,
        isPrimary: true
      });

    expect(createBank.status).toBe(201);
    expect(createBank.body.status).toBe('success');
    expect(createBank.body.data.id).toBeDefined();
    expect(createBank.body.data._id).toBe(createBank.body.data.id);
    bankId = createBank.body.data.id;

    const createWallet = await request(app)
      .post('/api/wallets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Cash In Hand',
        walletType: 'cash',
        openingBalance: 5000
      });

    expect(createWallet.status).toBe(201);
    expect(createWallet.body.status).toBe('success');
    expect(createWallet.body.data.id).toBeDefined();
    walletId = createWallet.body.data.id;

    const listBanks = await request(app)
      .get('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`);
    expect(listBanks.status).toBe(200);
    expect(listBanks.body.status).toBe('success');
    expect(listBanks.body.data.some(b => b.id === bankId)).toBe(true);
  });

  it('creates month through MonthLifecycle, logs items, transfers, and simulates cashflow', async () => {
    // 1. Create Month
    const monthRes = await request(app)
      .post('/api/months')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        year: 2026,
        month: 11,
        openingBalance: 55000,
        incomeAmount: 100000,
        incomeCreditDate: '2026-11-01',
        safetyFloor: 10000,
        unplannedAllowance: 5000,
        salaryAccountId: bankId,
        accountOpeningBalances: [
          { accountId: bankId, amount: 50000 },
          { accountId: walletId, amount: 5000 }
        ]
      });

    expect(monthRes.status).toBe(201);
    expect(monthRes.body.status).toBe('success');
    expect(monthRes.body.data.id).toBeDefined();
    monthId = monthRes.body.data.id;

    // 2. Create planned item
    const itemRes = await request(app)
      .post('/api/months/2026/11/items')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'one-time',
        name: 'Groceries',
        amount: 4000,
        date: '2026-11-05',
        accountId: bankId
      });

    expect(itemRes.status).toBe(201);
    expect(itemRes.body.status).toBe('success');
    expect(itemRes.body.data.id).toBeDefined();
    itemId = itemRes.body.data.id;

    // 3. Mark planned item as paid
    const paidRes = await request(app)
      .put(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isPaid: true });

    expect(paidRes.status).toBe(200);
    expect(paidRes.body.status).toBe('success');
    expect(paidRes.body.data.isPaid).toBe(true);

    // 4. Log spent transaction
    const txRes = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 1500,
        category: 'Food',
        note: 'Supermarket shopping',
        date: '2026-11-06',
        accountId: bankId
      });

    expect(txRes.status).toBe(201);
    expect(txRes.body.status).toBe('success');
    expect(txRes.body.data.id).toBeDefined();
    expect(txRes.body.data.amount).toBe(1500);

    // 5. Log credit / refund mapped strictly to spent transaction per ADR 0062
    const refundRes = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: -500,
        category: 'Refund',
        note: 'Partial grocery return refund',
        date: '2026-11-07',
        accountId: bankId,
        refundTargetTransactionId: txRes.body.data.id,
        isCredit: true
      });

    expect(refundRes.status).toBe(201);
    expect(refundRes.body.status).toBe('success');
    expect(refundRes.body.data.amount).toBe(-500);
    expect(refundRes.body.data.refundTargetTransactionId).toBe(txRes.body.data.id);

    // 6. Transfer funds between bank and wallet
    const transferRes = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        monthId,
        date: '2026-11-08',
        amount: 3000,
        sourceAccountId: bankId,
        destinationAccountId: walletId,
        note: 'ATM cash withdrawal'
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.status).toBe('success');
    expect(transferRes.body.data.id).toBeDefined();
    expect(transferRes.body.data.amount).toBe(3000);

    // 7. Purchase Goals: create and convert to item
    const goalRes = await request(app)
      .post('/api/months/2026/11/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Headphones',
        targetAmount: 8000,
        priority: 1,
        fundingAccountId: bankId
      });

    expect(goalRes.status).toBe(201);
    expect(goalRes.body.status).toBe('success');
    expect(goalRes.body.data.id).toBeDefined();
    const goalId = goalRes.body.data.id;

    const convertRes = await request(app)
      .post(`/api/goals/${goalId}/convert-to-item`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.status).toBe('success');
    expect(convertRes.body.data.item).toBeDefined();
    expect(convertRes.body.data.goal.status).toBe('scheduled');

    // 8. Fetch full month details with cashflow simulation and account-level summaries
    const detailRes = await request(app)
      .get('/api/months/2026/11')
      .set('Authorization', `Bearer ${authToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.status).toBe('success');
    expect(detailRes.body.data.month).toBeDefined();
    expect(detailRes.body.data.simulation).toBeDefined();
    expect(detailRes.body.data.accountSimulations).toBeDefined();
    expect(detailRes.body.data.accountSimulations[bankId]).toBeDefined();
    expect(detailRes.body.data.accountSimulations[walletId]).toBeDefined();

    // 9. Perform Rollover to next month
    const rolloverRes = await request(app)
      .post('/api/months/2026/11/rollover')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        carryBalance: true,
        currentYear: 2026,
        currentMonthNum: 11
      });

    expect(rolloverRes.status).toBe(201);
    expect(rolloverRes.body.status).toBe('success');
    expect(rolloverRes.body.data.month).toBeDefined();
    expect(rolloverRes.body.data.month.year).toBe(2026);
    expect(rolloverRes.body.data.month.month).toBe(12);
  });
});
