import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

// Roadmap phase 2: responses carry only fields a client reads. A new database column shows up here
// as a failing key set, so it reaches the API only when someone adds it on purpose.
const NEVER_SENT = [
  'userId', 'passwordHash', 'createdAt', 'updatedAt', 'heldByDay', 'itemNetMap', 'originalDate',
  'username', 'accountDailyBalances', 'accountSummaries', 'intradayEvents'
];

const keysAnywhere = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysAnywhere(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); keysAnywhere(v, found); }
  }
  return found;
};

describe('Public API contract', () => {
  let app;
  let auth;
  const bodies = {};

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `contract_${Date.now()}@example.com`, password: 'Password123!' });
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const userId = reg.body.data.user.id;

    const main = await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Main', type: 'bank', openingBalance: 50000, isPrimary: true });
    await MonthLifecycle.createMonth(userId, { year: 2032, month: 4, incomeAmount: 0, safetyFloor: 0, unplannedAllowance: 0 });
    const [month] = await db.select().from(s.months).where(eq(s.months.userId, userId));
    await db.insert(s.transactions).values({
      userId, accountId: main.body.data.id, monthId: month.id, name: 'Rent', amount: 3000,
      date: '2032-04-05', status: 'successful', origin: 'spot'
    });

    for (const [name, url] of Object.entries({
      me: '/api/auth/me', accounts: '/api/v1/accounts', detail: '/api/v1/periods/2032/4',
      monthTx: '/api/v1/periods/2032/4/transactions', allTx: '/api/v1/transactions'
    })) {
      const res = await request(app).get(url).set(auth);
      expect(res.status, url).toBe(200);
      bodies[name] = res.body.data;
    }
  });

  it('no response carries an internal or duplicate field at any depth', () => {
    for (const [name, body] of Object.entries(bodies)) {
      const found = keysAnywhere(body);
      for (const key of NEVER_SENT) expect(found.has(key), `${name}.${key}`).toBe(false);
    }
  });

  it('core resources keep their exact key sets', () => {
    const sorted = (o) => Object.keys(o).sort();
    expect(sorted(bodies.me.user)).toEqual(['_id', 'email', 'id']);
    expect(sorted(bodies.accounts.find((a) => a.name === 'Main'))).toEqual([
      '_id', 'accountNumberMasked', 'accountType', 'bankAccountId', 'color', 'creditLimit',
      'currentBalance', 'dueDay', 'id', 'institution', 'isArchived', 'isPrimary', 'minimumBalance',
      'name', 'openingBalance', 'openingBalanceDate', 'payFromAccountId', 'statementDay', 'subtype', 'type'
    ]);
    expect(sorted(bodies.monthTx.find((t) => t.name === 'Rent'))).toEqual([
      '_id', 'account', 'accountId', 'accountType', 'amount', 'bankAccountId', 'category', 'date', 'day',
      'dayOfMonth', 'derivedStatus', 'destinationAccount', 'destinationAccountId', 'goalId', 'id',
      'isIncome', 'legacyItemId', 'monthId', 'name', 'note', 'origin', 'originalDay', 'personFundId',
      'plannedAmount', 'plannedDate', 'plannedItemId', 'recurrence', 'refundTargetTransactionId',
      'status', 'tag', 'transferId'
    ]);
    expect(sorted(bodies.detail)).toEqual([
      'accountSimulations', 'bankAccounts', 'creditCards', 'items', 'month', 'simulation',
      'transactions', 'transfers', 'wallets'
    ]);
    expect(sorted(bodies.detail.month)).toEqual([
      '_id', 'accountOpeningBalances', 'closedAt', 'closingBalances', 'currencySymbol', 'endDate', 'id',
      'incomeAmount', 'incomeCreditDate', 'isClosed', 'isSalaryCredited', 'month', 'openingBalance',
      'safetyFloor', 'salaryAccountId', 'salaryBankAccountId', 'salaryCreditedDate', 'startDate',
      'unplannedAllowance', 'year'
    ]);
  });
});
