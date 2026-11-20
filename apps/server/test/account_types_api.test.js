import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, ensureDatabaseInitialized } from '../src/db/index.js';
import * as s from '../src/db/schema.js';

// Transactions and transfers report the real type of the account they use
// (accountType / sourceType / destinationType), not a hard-coded 'bank'.
describe('Account types on transactions and transfers', () => {
  let app;
  let auth;
  let userId;
  const ids = {};
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = (d) => `${year}-${pad(month)}-${pad(d)}`;

  const createAccount = async (body) => {
    const res = await request(app).post('/api/v1/accounts').set(auth).send(body);
    expect(res.status).toBe(201);
    return res.body.data.id;
  };
  const spend = async (name, accountId) => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth)
      .send({ name, amount: 15000, origin: 'spot', date: day(2), accountId, category: 'Food' });
    expect(res.status).toBe(201);
    return res.body.data.id;
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `account_types_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    auth = { Authorization: `Bearer ${reg.body.data.token}` };

    ids.bank = await createAccount({ name: 'Main', type: 'bank', openingBalance: 10000000, isPrimary: true });
    ids.wallet = await createAccount({ name: 'Pocket', type: 'wallet', openingBalance: 500000 });
    ids.card = await createAccount({
      name: 'Visa', type: 'credit_card', creditLimit: 5000000,
      statementDay: 20, dueDay: 28, payFromAccountId: ids.bank, currentOutstanding: 0, openingBalanceDate: day(1)
    });

    const m = await request(app)
      .post('/api/months')
      .set(auth)
      .send({ year, month, openingBalance: 10500000, incomeAmount: 0, safetyFloor: 100000, salaryAccountId: ids.bank });
    expect([200, 201]).toContain(m.status);

    ids.bankSpend = await spend('Rent top-up', ids.bank);
    ids.walletSpend = await spend('Coffee', ids.wallet);
    ids.cardSpend = await spend('Shoes', ids.card);

    const tr = await request(app)
      .post('/api/v1/transfers')
      .set(auth)
      .send({ sourceAccountId: ids.bank, destinationAccountId: ids.wallet, amount: 20000, date: day(3), note: 'Top-up' });
    expect(tr.status).toBe(201);
    ids.transfer = tr.body.data.transfer?.id || tr.body.data.id;
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  it('GET /api/v1/periods/:y/:m gives each spend its account type', async () => {
    const res = await request(app).get(`/api/v1/periods/${year}/${month}`).set(auth);
    expect(res.status).toBe(200);
    const txs = res.body.data.transactions;
    const byId = (id) => txs.find((t) => t.id === id);
    expect(byId(ids.bankSpend).accountType).toBe('bank');
    expect(byId(ids.walletSpend).accountType).toBe('wallet');
    expect(byId(ids.cardSpend).accountType).toBe('credit_card');

    // The transfer's mirror transaction and the transfer row itself
    const mirror = txs.find((t) => t.transferId === ids.transfer);
    expect(mirror.accountType).toBe('bank');
    expect(mirror.destinationType).toBe('wallet');
    const transfer = res.body.data.transfers.find((t) => t.id === ids.transfer);
    expect(transfer.sourceType).toBe('bank');
    expect(transfer.destinationType).toBe('wallet');
  });

  it('GET /api/v1/periods/:y/:m still counts the wallet spend against the wallet', async () => {
    const res = await request(app).get(`/api/v1/periods/${year}/${month}`).set(auth);
    const wallet = res.body.data.accountSimulations[ids.wallet];
    // 5,000.00 opening + 200.00 top-up - 150.00 coffee
    expect(wallet.endingBalance).toBe(500000 + 20000 - 15000);
  });

  it('GET /api/v1/transfers reports source bank and destination wallet', async () => {
    const res = await request(app).get('/api/v1/transfers').set(auth);
    expect(res.status).toBe(200);
    const transfer = res.body.data.find((t) => t.id === ids.transfer);
    expect(transfer.sourceType).toBe('bank');
    expect(transfer.destinationType).toBe('wallet');
  });

  it('GET /api/v1/transactions gives each spend its account type', async () => {
    const res = await request(app).get('/api/v1/transactions').set(auth);
    expect(res.status).toBe(200);
    const list = Array.isArray(res.body.data) ? res.body.data : res.body.data.transactions;
    const byId = (id) => list.find((t) => t.id === id);
    expect(byId(ids.walletSpend).accountType).toBe('wallet');
    expect(byId(ids.cardSpend).accountType).toBe('credit_card');
  });
});
