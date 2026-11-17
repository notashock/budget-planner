import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/index.js';

/**
 * Legacy vs /api/v1 parity.
 *
 * The same scenario runs twice, for two fresh users: once through the legacy
 * routes the web app used to call, once through their /api/v1 replacements.
 * Every step's status and (normalized) payload must match.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const VOLATILE_KEYS = new Set(['timestamp', 'durationMs', 'metadata']);

// Ids and timestamps differ between the two users; everything else must not.
// Ids of entities the scenario creates are labelled in creation order, so
// references between entities (a transfer's account ids, a simulation keyed by
// account) still compare; any other id becomes "<id>".
function registerIds(data, ids) {
  for (const entity of [data, data?.month, data?.transfer, data?.transaction]) {
    for (const id of [entity?.userId, entity?.id]) {
      if (typeof id === 'string' && !ids.has(id.toLowerCase())) ids.set(id.toLowerCase(), `<id${ids.size + 1}>`);
    }
  }
}

// Several endpoints return rows in database order, which Postgres does not fix
// without ORDER BY, so lists compare as multisets.
function canonicalOrder(list) {
  return [...list].sort((a, b) => {
    const ka = JSON.stringify(a);
    const kb = JSON.stringify(b);
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });
}

function normalize(value, ids) {
  const label = (id) => ids.get(id.toLowerCase()) || '<id>';
  if (Array.isArray(value)) return canonicalOrder(value.map((v) => normalize(v, ids)));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (!VOLATILE_KEYS.has(key)) out[key.replace(UUID_RE, label)] = normalize(value[key], ids);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (ISO_TS_RE.test(value)) return '<ts>';
    return value.replace(UUID_RE, label);
  }
  return value;
}

function outcome(res, ids, pick = (data) => data) {
  if (res.status >= 400) {
    return { status: res.status, error: normalize({ code: res.body.error?.code, message: res.body.error?.message }, ids) };
  }
  expect(res.body.status).toBe('success');
  registerIds(res.body.data, ids);
  return { status: res.status, data: normalize(pick(res.body.data), ids) };
}

async function registerUser(app, label) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `parity_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'Password123!' });
  return res.body.data?.token || res.body.token;
}

function client(app, token) {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body = {}) => auth(request(app).post(url)).send(body),
    put: (url, body = {}) => auth(request(app).put(url)).send(body),
    patch: (url, body = {}) => auth(request(app).patch(url)).send(body),
    del: (url) => auth(request(app).delete(url))
  };
}

// Each surface maps scenario operations onto its own routes.
const legacySurface = (c) => ({
  createAccount: (body) => c.post(body.type === 'wallet' ? '/api/wallets' : '/api/bank-accounts', body),
  listAccounts: (type, includeArchived = false) => {
    const qs = includeArchived ? '?includeArchived=true' : '';
    if (type === 'bank') return c.get(`/api/bank-accounts${qs}`);
    if (type === 'wallet') return c.get(`/api/wallets${qs}`);
    return c.get(`/api/bank-accounts/all${qs}`);
  },
  updateAccount: (id, type, body) => c.put(`/api/${type === 'wallet' ? 'wallets' : 'bank-accounts'}/${id}`, body),
  archiveAccount: (id, type) => c.del(`/api/${type === 'wallet' ? 'wallets' : 'bank-accounts'}/${id}`),
  archivedFrom: (data) => data.account || data.wallet,
  migrationStatus: () => c.get('/api/bank-accounts/migration-status'),

  listMonths: () => c.get('/api/months'),
  createMonth: (body) => c.post('/api/months', body),
  monthDetail: (y, m) => c.get(`/api/months/${y}/${m}`),
  updateMonth: (y, m, body) => c.put(`/api/months/${y}/${m}`, body),
  creditSalary: (y, m, body) => c.post(`/api/months/${y}/${m}/credit-salary`, body),
  recommendPurchaseDate: (y, m, body) => c.post(`/api/months/${y}/${m}/recommend-purchase-date`, body),
  rollover: (y, m, body) => c.post(`/api/months/${y}/${m}/rollover`, body),
  deleteMonth: (y, m) => c.del(`/api/months/${y}/${m}?force=true`),
  monthEndReview: (y, m) => c.get(`/api/months/${y}/${m}/month-end-review`),

  listMonthTransactions: (y, m) => c.get(`/api/months/${y}/${m}/transactions`),
  createMonthTransaction: (y, m, body) => c.post(`/api/months/${y}/${m}/transactions`, body),
  listTransactions: (qs = '') => c.get(`/api/transactions${qs}`),
  createTransaction: (body) => c.post('/api/transactions', body),
  updateTransaction: (id, body) => c.put(`/api/transactions/${id}`, body),
  payTransaction: (id, body) => c.patch(`/api/transactions/${id}/pay`, body),
  cancelTransaction: (id, body) => c.patch(`/api/transactions/${id}/cancel`, body),
  deleteTransaction: (id) => c.del(`/api/transactions/${id}`),
  irregularReports: (qs) => c.get(`/api/reports/irregular${qs}`),

  listGoals: (y, m) => c.get(`/api/months/${y}/${m}/goals`),
  createGoal: (y, m, body) => c.post(`/api/months/${y}/${m}/goals`, body),
  updateGoal: (id, body) => c.put(`/api/goals/${id}`, body),
  deferGoal: (id) => c.post(`/api/goals/${id}/defer`),
  reactivateGoal: (id) => c.post(`/api/goals/${id}/reactivate`),
  scheduleGoal: (id, body) => c.post(`/api/goals/${id}/schedule`, body),
  deleteGoal: (id) => c.del(`/api/goals/${id}`),

  listTransfers: (monthId) => c.get(`/api/transfers${monthId ? `?monthId=${monthId}` : ''}`),
  createTransfer: (body) => c.post('/api/transfers', body),
  updateTransfer: (id, body) => c.put(`/api/transfers/${id}`, body),
  deleteTransfer: (id) => c.del(`/api/transfers/${id}`),
  deletedTransferFrom: (data) => data.transfer
});

const v1Surface = (c) => ({
  createAccount: (body) => c.post('/api/v1/accounts', body),
  listAccounts: (type, includeArchived = false) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (includeArchived) params.set('includeArchived', 'true');
    const qs = params.toString();
    return c.get(`/api/v1/accounts${qs ? `?${qs}` : ''}`);
  },
  updateAccount: (id, _type, body) => c.patch(`/api/v1/accounts/${id}`, body),
  archiveAccount: (id) => c.del(`/api/v1/accounts/${id}`),
  archivedFrom: (data) => data,
  migrationStatus: () => c.get('/api/v1/accounts/migration-status'),

  listMonths: () => c.get('/api/v1/periods'),
  createMonth: (body) => c.post('/api/v1/periods', body),
  monthDetail: (y, m) => c.get(`/api/v1/periods/${y}/${m}`),
  updateMonth: (y, m, body) => c.patch(`/api/v1/periods/${y}/${m}`, body),
  creditSalary: (y, m, body) => c.post(`/api/v1/periods/${y}/${m}/credit-salary`, body),
  recommendPurchaseDate: (y, m, body) => c.post(`/api/v1/periods/${y}/${m}/recommend-purchase-date`, body),
  rollover: (y, m, body) => c.post(`/api/v1/periods/${y}/${m}/rollover`, body),
  deleteMonth: (y, m) => c.del(`/api/v1/periods/${y}/${m}?force=true`),
  monthEndReview: (y, m) => c.get(`/api/v1/periods/${y}/${m}/month-end-review`),

  listMonthTransactions: (y, m) => c.get(`/api/v1/periods/${y}/${m}/transactions`),
  createMonthTransaction: (y, m, body) => c.post(`/api/v1/periods/${y}/${m}/transactions`, body),
  listTransactions: (qs = '') => c.get(`/api/v1/transactions${qs}`),
  createTransaction: (body) => c.post('/api/v1/transactions', body),
  updateTransaction: (id, body) => c.patch(`/api/v1/transactions/${id}`, body),
  payTransaction: (id, body) => c.post(`/api/v1/transactions/${id}/pay`, body),
  cancelTransaction: (id, body) => c.post(`/api/v1/transactions/${id}/cancel`, body),
  deleteTransaction: (id) => c.del(`/api/v1/transactions/${id}`),
  irregularReports: (qs) => c.get(`/api/v1/reports/irregular${qs}`),

  listGoals: (y, m) => c.get(`/api/v1/periods/${y}/${m}/goals`),
  createGoal: (y, m, body) => c.post(`/api/v1/periods/${y}/${m}/goals`, body),
  updateGoal: (id, body) => c.patch(`/api/v1/goals/${id}`, body),
  deferGoal: (id) => c.post(`/api/v1/goals/${id}/defer`),
  reactivateGoal: (id) => c.post(`/api/v1/goals/${id}/reactivate`),
  scheduleGoal: (id, body) => c.post(`/api/v1/goals/${id}/schedule`, body),
  deleteGoal: (id) => c.del(`/api/v1/goals/${id}`),

  listTransfers: (monthId) => c.get(`/api/v1/transfers${monthId ? `?monthId=${monthId}` : ''}`),
  createTransfer: (body) => c.post('/api/v1/transfers', body),
  updateTransfer: (id, body) => c.patch(`/api/v1/transfers/${id}`, body),
  deleteTransfer: (id) => c.del(`/api/v1/transfers/${id}`),
  deletedTransferFrom: (data) => data
});

/** Runs the shared scenario on one surface and returns { step: outcome }. */
async function runScenario(api) {
  const steps = {};
  const ids = new Map();
  const record = async (name, resPromise, pick) => {
    const res = await resPromise;
    steps[name] = outcome(res, ids, pick);
    return res.body.data;
  };

  // --- Accounts ---------------------------------------------------------
  await record('account.create.missingName', api.createAccount({ name: '  ' }));
  const bankA = await record('account.create.firstBank', api.createAccount({
    name: 'Salary Bank', type: 'bank', accountType: 'salary', institution: 'HDFC',
    openingBalance: '₹1,50,000', openingBalanceDate: '2026-11-01', minimumBalance: '5000'
  }));
  const bankB = await record('account.create.primaryBank', api.createAccount({
    name: 'Savings Bank', type: 'bank', accountType: 'savings', openingBalance: 40000, isPrimary: true
  }));
  const wallet = await record('account.create.wallet', api.createAccount({
    name: 'UPI Wallet', type: 'wallet', walletType: 'digital', openingBalance: 2500, color: '#123456'
  }));
  await record('account.list.bank', api.listAccounts('bank'));
  await record('account.list.wallet', api.listAccounts('wallet'));
  await record('account.list.all', api.listAccounts(null));
  await record('account.update.bank', api.updateAccount(bankA.id, 'bank', {
    name: 'Salary Bank (renamed)', minimumBalance: '7,500', isPrimary: true
  }));
  await record('account.list.afterPrimarySwap', api.listAccounts('bank'));
  await record('account.migrationStatus', api.migrationStatus());

  // --- Months / periods ---------------------------------------------------
  const month = await record('month.create', api.createMonth({ year: 2026, month: 11, openingBalance: 150000, safetyFloor: 10000 }));
  await record('month.list', api.listMonths());
  await record('month.update', api.updateMonth(2026, 11, { safetyFloor: 20000 }));
  await record('account.update.openingBalance', api.updateAccount(bankA.id, 'bank', { openingBalance: 160000 }));

  // --- Transactions ---------------------------------------------------------
  const planned = await record('tx.createForMonth.planned', api.createMonthTransaction(2026, 11, {
    name: 'Rent', amount: 25000, date: '2026-11-05', category: 'Housing', accountId: bankA.id, origin: 'planned', status: 'planned'
  }));
  const plannedToCancel = await record('tx.createForMonth.toCancel', api.createMonthTransaction(2026, 11, {
    name: 'Gym', amount: 1500, date: '2026-11-20', category: 'Health', accountId: bankA.id, origin: 'planned', status: 'planned'
  }));
  const spent = await record('tx.createGlobal.successful', api.createTransaction({
    name: 'Groceries', amount: 3200, date: '2026-11-08', category: 'Food', accountId: wallet.id, status: 'successful'
  }));
  await record('tx.createGlobal.invalidAccount', api.createTransaction({
    name: 'Bad', amount: 100, date: '2026-11-08', accountId: '00000000-0000-4000-8000-000000000000', status: 'successful'
  }));
  await record('tx.listForMonth', api.listMonthTransactions(2026, 11));
  await record('tx.listGlobal.filtered', api.listTransactions(`?status=successful&accountId=${wallet.id}`));
  await record('tx.update', api.updateTransaction(planned.id, { amount: 26000, note: 'Raised' }));
  await record('tx.pay', api.payTransaction(planned.id, {}));
  await record('tx.cancel', api.cancelTransaction(plannedToCancel.id, {}));
  await record('tx.delete', api.deleteTransaction(spent.id));
  await record('tx.listGlobal.all', api.listTransactions());
  await record('month.endReview', api.monthEndReview(2026, 11));
  await record('reports.irregular', api.irregularReports('?asOfDate=2026-11-30'));

  // --- Goals ----------------------------------------------------------------
  const goal = await record('goal.create', api.createGoal(2026, 11, { name: 'Headphones', targetAmount: 8000, priority: 1, fundingAccountId: bankA.id }));
  await record('goal.list', api.listGoals(2026, 11));
  await record('goal.update', api.updateGoal(goal.id, { targetAmount: 9000 }));
  await record('goal.defer', api.deferGoal(goal.id));
  await record('goal.reactivate', api.reactivateGoal(goal.id));
  await record('goal.schedule', api.scheduleGoal(goal.id, { date: '2026-11-25' }));
  const goal2 = await record('goal.create.second', api.createGoal(2026, 11, { name: 'Shoes', targetAmount: 4000, fundingAccountId: bankA.id }));
  await record('goal.delete', api.deleteGoal(goal2.id));

  // --- Transfers ------------------------------------------------------------
  await record('transfer.create.sameAccount', api.createTransfer({ sourceAccountId: bankA.id, destinationAccountId: bankA.id, amount: 100, date: '2026-11-10' }));
  const transfer = await record('transfer.create', api.createTransfer({
    sourceAccountId: bankA.id, destinationAccountId: wallet.id, amount: 5000, date: '2026-11-10', note: 'Top-up', monthId: month.month?.id || month.id
  }));
  await record('transfer.list', api.listTransfers(transfer.monthId));
  await record('transfer.update', api.updateTransfer(transfer.id, { amount: 6000, note: 'Top-up (fixed)' }));
  await record('account.list.afterTransfer', api.listAccounts(null));
  await record('transfer.delete', api.deleteTransfer(transfer.id), api.deletedTransferFrom);
  await record('account.list.afterTransferDelete', api.listAccounts(null));

  // --- Month lifecycle --------------------------------------------------------
  await record('month.detail', api.monthDetail(2026, 11));
  await record('month.recommendPurchaseDate', api.recommendPurchaseDate(2026, 11, { amount: 5000, currentDay: 10 }));
  await record('month.creditSalary', api.creditSalary(2026, 11, { amount: 90000, date: '2026-11-01', accountId: bankA.id }));
  await record('month.rollover', api.rollover(2026, 11, { carryBalance: true }));
  await record('month.delete', api.deleteMonth(2026, 12));
  await record('month.detail.missing', api.monthDetail(2031, 1));

  // --- Archive ---------------------------------------------------------------
  await record('account.archive.wallet', api.archiveAccount(wallet.id, 'wallet'), api.archivedFrom);
  await record('account.archive.bank', api.archiveAccount(bankB.id, 'bank'), api.archivedFrom);
  await record('account.list.includeArchived', api.listAccounts(null, true));
  await record('account.list.activeOnly', api.listAccounts(null));

  return steps;
}

describe('Legacy routes and /api/v1 give the same results', () => {
  let legacySteps;
  let v1Steps;

  beforeAll(async () => {
    await runMigrations();
    const app = createApp();
    const [legacyToken, v1Token] = await Promise.all([registerUser(app, 'legacy'), registerUser(app, 'v1')]);
    legacySteps = await runScenario(legacySurface(client(app, legacyToken)));
    v1Steps = await runScenario(v1Surface(client(app, v1Token)));
  }, 120000);

  it('runs the same steps on both surfaces', () => {
    expect(Object.keys(v1Steps)).toEqual(Object.keys(legacySteps));
  });

  const STEP_NAMES = [
    'account.create.missingName', 'account.create.firstBank', 'account.create.primaryBank', 'account.create.wallet',
    'account.list.bank', 'account.list.wallet', 'account.list.all', 'account.update.bank', 'account.list.afterPrimarySwap',
    'account.migrationStatus', 'month.create', 'month.list', 'month.update', 'account.update.openingBalance',
    'tx.createForMonth.planned', 'tx.createForMonth.toCancel', 'tx.createGlobal.successful', 'tx.createGlobal.invalidAccount',
    'tx.listForMonth', 'tx.listGlobal.filtered', 'tx.update', 'tx.pay', 'tx.cancel', 'tx.delete', 'tx.listGlobal.all',
    'month.endReview', 'reports.irregular', 'goal.create', 'goal.list', 'goal.update', 'goal.defer', 'goal.reactivate',
    'goal.schedule', 'goal.create.second', 'goal.delete', 'transfer.create.sameAccount', 'transfer.create', 'transfer.list',
    'transfer.update', 'account.list.afterTransfer', 'transfer.delete', 'account.list.afterTransferDelete', 'month.detail',
    'month.recommendPurchaseDate', 'month.creditSalary', 'month.rollover', 'month.delete', 'month.detail.missing',
    'account.archive.wallet', 'account.archive.bank', 'account.list.includeArchived', 'account.list.activeOnly'
  ];

  it.each(STEP_NAMES)('%s', (step) => {
    expect(v1Steps[step]).toBeDefined();
    expect(v1Steps[step]).toEqual(legacySteps[step]);
  });

  // Sanity checks on behaviour the parity rests on, so "both equally broken" fails too
  it('demotes the previous primary, keeps the opening balance as the ledger balance and moves money on transfer', () => {
    const banks = v1Steps['account.list.bank'].data;
    expect(banks.filter((b) => b.isPrimary).map((b) => b.name)).toEqual(['Savings Bank']);

    const created = v1Steps['account.create.firstBank'].data;
    expect(created.openingBalance).toBe(150000);
    expect(created.currentBalance).toBe(150000);
    expect(created.minimumBalance).toBe(5000);
    expect(created.openingBalanceDate).toBe('2026-11-01');
    expect(created.subtype).toBe('salary');

    expect(v1Steps['account.update.bank'].data.minimumBalance).toBe(7500);
    expect(v1Steps['account.create.missingName'].status).toBe(400);

    const before = v1Steps['account.list.afterTransfer'].data;
    const after = v1Steps['account.list.afterTransferDelete'].data;
    const wallet = (list) => list.find((a) => a.name === 'UPI Wallet');
    expect(wallet(before).currentBalance - wallet(after).currentBalance).toBe(6000);

    expect(v1Steps['transfer.create.sameAccount'].status).toBe(400);
    expect(v1Steps['transfer.create'].status).toBe(201);
    expect(v1Steps['month.detail.missing'].status).toBe(404);
  });
});

describe('v1 transfers only touch the caller\'s accounts', () => {
  it('rejects a transfer into another user\'s account on both v1 transfer routes', async () => {
    await runMigrations();
    const app = createApp();
    const [ownerToken, otherToken] = await Promise.all([registerUser(app, 'owner'), registerUser(app, 'other')]);
    const owner = client(app, ownerToken);
    const other = client(app, otherToken);

    const mine = (await owner.post('/api/v1/accounts', { name: 'Mine', openingBalance: 10000 })).body.data;
    const theirs = (await other.post('/api/v1/accounts', { name: 'Theirs', openingBalance: 10000 })).body.data;

    for (const url of ['/api/v1/transfers', '/api/v1/accounts/transfers']) {
      const res = await owner.post(url, { sourceAccountId: mine.id, destinationAccountId: theirs.id, amount: 500, date: '2026-11-10' });
      expect(res.status).toBe(400);
    }

    const theirsAfter = (await other.get('/api/v1/accounts')).body.data.find((a) => a.id === theirs.id);
    expect(theirsAfter.currentBalance).toBe(10000);
  });
});
