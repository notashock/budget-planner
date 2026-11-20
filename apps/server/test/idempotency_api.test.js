import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool, ensureDatabaseInitialized, syncIdempotencySchema } from '../src/db/index.js';
import * as s from '../src/db/schema.js';

// Postgres integration: a write retried with the same Idempotency-Key creates
// one transaction and moves the balance once (docs/MOBILE_APP_UPGRADE_PLAN.md, 1.6).
describe('Idempotency-Key on /api/v1 writes', () => {
  let app;
  let auth;
  let userId;
  let accountId;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day1 = `${year}-${String(month).padStart(2, '0')}-01`;

  const spend = (key, body = {}) => {
    let r = request(app).post(`/api/v1/periods/${year}/${month}/transactions`).set(auth);
    if (key) r = r.set('Idempotency-Key', key);
    return r.send({ name: 'Coffee', amount: 18000, origin: 'spot', date: day1, accountId, ...body });
  };
  const coffeeCount = async () => {
    const rows = await db.select().from(s.transactions)
      .where(and(eq(s.transactions.userId, userId), eq(s.transactions.name, 'Coffee')));
    return rows.length;
  };
  const balance = async () => {
    const acc = await db.query.accounts.findFirst({ where: eq(s.accounts.id, accountId) });
    return acc.currentBalance;
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    await syncIdempotencySchema();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `idem_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    auth = { Authorization: `Bearer ${reg.body.data.token}` };

    const acc = await request(app)
      .post('/api/bank-accounts')
      .set(auth)
      .send({ name: 'Main', institution: 'Bank', accountType: 'checking', openingBalance: 1000000, isPrimary: true });
    expect(acc.status).toBe(201);
    accountId = acc.body.data.id;

    const m = await request(app)
      .post('/api/months')
      .set(auth)
      .send({ year, month, openingBalance: 1000000, incomeAmount: 0, safetyFloor: 100000, salaryAccountId: accountId });
    expect([200, 201]).toContain(m.status);
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  it('creates one transaction when the same keyed spend is sent twice', async () => {
    const key = randomUUID();
    const before = await balance();

    const first = await spend(key);
    const retry = await spend(key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await coffeeCount()).toBe(1);
    expect(await balance()).toBe(before - 18000);
  });

  it('creates two transactions for two different keys', async () => {
    const start = await coffeeCount();
    await spend(randomUUID());
    await spend(randomUUID());
    expect(await coffeeCount()).toBe(start + 2);
  });

  it('rejects a reused key with a different amount', async () => {
    const key = randomUUID();
    const start = await coffeeCount();
    expect((await spend(key)).status).toBe(201);
    const reused = await spend(key, { amount: 99900 });
    expect(reused.status).toBe(422);
    expect(await coffeeCount()).toBe(start + 1);
  });

  it('stores the keys against the signed-in user', async () => {
    const res = await pool.query('SELECT count(*)::int AS n FROM idempotency_keys WHERE user_id = $1', [userId]);
    expect(res.rows[0].n).toBeGreaterThan(0);
  });
});
