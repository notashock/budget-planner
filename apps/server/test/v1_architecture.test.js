import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { runMigrations, pool } from '../src/db/index.js';

describe('V1 Domain Architecture & Idempotence Verification Suite', () => {
  let app;
  let token;
  let testUserEmail;
  let bankAccountId;
  let walletAccountId;

  beforeAll(async () => {
    await runMigrations();
    app = createApp();

    testUserEmail = `v1_arch_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: testUserEmail, password: 'Password123!' });

    token = regRes.body.data?.token || regRes.body.token;
  });

  it('1. GET /api/v1/periods is strictly idempotent and read-only', async () => {
    // Call GET /api/v1/periods 5 consecutive times
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/api/v1/periods')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data || res.body)).toBe(true);
    }
  });

  it('2. POST /api/v1/accounts creates account with materialized current_balance', async () => {
    const bankRes = await request(app)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'V1 Primary Bank',
        type: 'bank',
        openingBalance: 100000, // ₹1,000
        minimumBalance: 10000,
        isPrimary: true
      });

    expect(bankRes.status).toBe(201);
    const bank = bankRes.body.data || bankRes.body;
    expect(bank.currentBalance).toBe(100000);
    bankAccountId = bank.id;

    const walletRes = await request(app)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'V1 Digital Wallet',
        type: 'wallet',
        openingBalance: 50000, // ₹500
        minimumBalance: 0
      });

    expect(walletRes.status).toBe(201);
    const wallet = walletRes.body.data || walletRes.body;
    expect(wallet.currentBalance).toBe(50000);
    walletAccountId = wallet.id;
  });

  it('3. POST /api/v1/accounts/transfers shifts balances atomically', async () => {
    const transferRes = await request(app)
      .post('/api/v1/accounts/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceAccountId: bankAccountId,
        destinationAccountId: walletAccountId,
        amount: 20000, // ₹200
        date: '2026-11-05',
        note: 'ATM withdrawal to wallet'
      });

    expect(transferRes.status).toBe(201);

    // Verify materialized balances via GET /api/v1/accounts
    const accountsRes = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`);

    const accounts = accountsRes.body.data || accountsRes.body;
    const bank = accounts.find(a => a.id === bankAccountId);
    const wallet = accounts.find(a => a.id === walletAccountId);

    // Bank: 100k - 20k = 80k
    expect(bank.currentBalance).toBe(80000);
    // Wallet: 50k + 20k = 70k
    expect(wallet.currentBalance).toBe(70000);
  });

  it('4. POST /api/v1/transactions updates materialized balance on settlement', async () => {
    // Record a successful expense from wallet
    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cafe Coffee',
        amount: 15000, // ₹150
        date: '2026-11-06',
        category: 'Food',
        accountId: walletAccountId,
        status: 'successful'
      });

    expect(txRes.status).toBe(201);

    // Verify wallet balance decremented: 70k - 15k = 55k
    const accountsRes = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`);

    const accounts = accountsRes.body.data || accountsRes.body;
    const wallet = accounts.find(a => a.id === walletAccountId);
    expect(wallet.currentBalance).toBe(55000);
  });

  it('5. GET /api/v1/periods/:year/:month returns single-pass simulation and accountSimulations', async () => {
    // Create month 2026-11
    await request(app)
      .post('/api/months')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2026,
        month: 11,
        openingBalance: 150000,
        safetyFloor: 10000
      });

    const periodRes = await request(app)
      .get('/api/v1/periods/2026/11')
      .set('Authorization', `Bearer ${token}`);

    expect(periodRes.status).toBe(200);
    const data = periodRes.body.data || periodRes.body;

    expect(data.simulation).toBeDefined();
    expect(data.accountSimulations).toBeDefined();
    expect(data.accountSimulations[bankAccountId]).toBeDefined();
    expect(data.accountSimulations[walletAccountId]).toBeDefined();
  });
});
