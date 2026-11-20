import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, ensureDatabaseInitialized } from '../src/db/index.js';
import * as s from '../src/db/schema.js';

// Contract between this server and the mobile app (docs/MOBILE_APP_UPGRADE_PLAN.md, 1.10).
//
// Builds one realistic user, then reads every endpoint the mobile app loads.
// - RECORD_MOBILE_FIXTURES=1: writes the responses to apps/mobile/test/fixtures/api/,
//   where the Dart models must parse them (test/models_contract_test.dart).
// - Otherwise: checks the live responses still have every field, with the same
//   JSON type, that the committed fixtures have. Adding fields is fine; dropping
//   or retyping one that the app reads fails here, before a phone sees it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../../mobile/test/fixtures/api');
const RECORD = process.env.RECORD_MOBILE_FIXTURES === '1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Replaces ids and timestamps with stable placeholders so fixtures diff cleanly.
 * With `cap`, long arrays keep their first `cap` entries (the day-by-day
 * timeline would otherwise make month_detail.json ~235 KB).
 */
function normalize(value, ids = new Map(), cap = Infinity) {
  if (Array.isArray(value)) return value.slice(0, cap).map((v) => normalize(v, ids, cap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = UUID.test(k) ? idToken(k, ids) : k;
      out[key] = normalize(v, ids, cap);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (UUID.test(value)) return idToken(value, ids);
    if (TIMESTAMP.test(value)) return '2026-01-01T00:00:00.000Z';
  }
  return value;
}

function idToken(id, ids) {
  if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
  return ids.get(id);
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Every path in `expected` must exist in `actual` with the same type (null matches anything). */
function missingPaths(expected, actual, at = '$') {
  const problems = [];
  const te = typeOf(expected);
  const ta = typeOf(actual);
  if (te === 'null' || ta === 'null') return problems;
  if (te !== ta) return [`${at}: expected ${te}, got ${ta}`];
  if (te === 'array') {
    if (expected.length && actual.length) {
      // Compare the union of element fields against the first live element of the same shape.
      problems.push(...missingPaths(expected[0], actual[0], `${at}[0]`));
    }
    return problems;
  }
  if (te === 'object') {
    for (const k of Object.keys(expected)) {
      // Keys that are ids (maps keyed by account id) are not stable across runs.
      if (UUID.test(k)) continue;
      if (!(k in actual)) problems.push(`${at}.${k}: missing`);
      else problems.push(...missingPaths(expected[k], actual[k], `${at}.${k}`));
    }
  }
  return problems;
}

describe('mobile API contract fixtures', () => {
  let app;
  let auth;
  let userId;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const mm = String(month).padStart(2, '0');
  const day = (d) => `${year}-${mm}-${String(d).padStart(2, '0')}`;
  const today = Math.min(now.getDate(), 28);

  const responses = {};
  const get = async (name, url) => {
    const res = await request(app).get(url).set(auth);
    expect(res.status, `${name}: ${JSON.stringify(res.body).slice(0, 300)}`).toBe(200);
    responses[name] = res.body.data;
    return res.body.data;
  };
  const post = async (url, body, expected = [200, 201]) => {
    const res = await request(app).post(url).set(auth).send(body);
    expect(expected, `${url}: ${JSON.stringify(res.body).slice(0, 300)}`).toContain(res.status);
    return res.body.data;
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `mobile_contract_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    auth = { Authorization: `Bearer ${reg.body.data.token}` };

    const bank = await post('/api/v1/accounts', { name: 'Main', type: 'bank', openingBalance: 5000000, isPrimary: true });
    const wallet = await post('/api/v1/accounts', { name: 'UPI', type: 'wallet', walletType: 'digital', openingBalance: 250000 });
    await post('/api/months', {
      year, month, openingBalance: 5000000, incomeAmount: 8000000, incomeCreditDay: 1,
      safetyFloor: 500000, salaryAccountId: bank.id
    });
    const card = await post('/api/v1/accounts', {
      name: 'Visa', type: 'credit_card', creditLimit: 10000000, statementDay: 20, dueDay: 5,
      payFromAccountId: bank.id, currentOutstanding: 0, openingBalanceDate: day(1)
    });

    const tx = `/api/v1/periods/${year}/${month}/transactions`;
    await post(tx, { name: 'Groceries', amount: 245000, origin: 'spot', category: 'Food', date: day(today), accountId: bank.id });
    await post(tx, { name: 'Coffee', amount: 18000, origin: 'spot', category: 'Food', date: day(today), accountId: wallet.id });
    await post(tx, { name: 'Freelance', amount: 1500000, isIncome: true, origin: 'spot', date: day(Math.max(1, today - 1)), accountId: bank.id });
    await post(tx, { name: 'Shoes', amount: 350000, origin: 'spot', category: 'Shopping', date: day(today), accountId: card.id });
    await post(tx, {
      name: 'Rent', status: 'planned', origin: 'planned', plannedAmount: 2500000, plannedDate: day(28),
      amount: 2500000, date: day(28), category: 'Housing', accountId: bank.id
    });
    await post(`/api/v1/periods/${year}/${month}/goals`, { name: 'Headphones', targetAmount: 800000, priority: 1, fundingAccountId: bank.id });
    await post('/api/v1/transfers', { sourceAccountId: bank.id, destinationAccountId: wallet.id, amount: 100000, date: day(today) });
    await post('/api/v1/person-funds', { personName: 'Ravi', direction: 'held', amount: 200000, date: day(today), accountId: bank.id });

    await get('periods', '/api/v1/periods');
    await get('month_detail', `/api/v1/periods/${year}/${month}`);
    // Month detail carries no goals; the app loads them from here.
    await get('goals', `/api/v1/periods/${year}/${month}/goals`);
    await get('accounts_bank', '/api/v1/accounts?type=bank');
    await get('accounts_wallet', '/api/v1/accounts?type=wallet');
    await get('transfers', '/api/v1/transfers');
    await get('cards', '/api/v1/cards');
    await get('person_funds', '/api/v1/person-funds');
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  it(RECORD ? 'records the fixtures' : 'still serves every field the committed fixtures have', () => {
    const names = Object.keys(responses);
    expect(names).toHaveLength(8);

    if (RECORD) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
      const ids = new Map();
      for (const name of names) {
        const file = path.join(FIXTURE_DIR, `${name}.json`);
        fs.writeFileSync(file, `${JSON.stringify(normalize(responses[name], ids, 8), null, 2)}\n`);
      }
      return;
    }

    const problems = [];
    for (const name of names) {
      const file = path.join(FIXTURE_DIR, `${name}.json`);
      expect(fs.existsSync(file), `${file} is missing: run with RECORD_MOBILE_FIXTURES=1`).toBe(true);
      const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
      problems.push(...missingPaths(fixture, normalize(responses[name])).map((p) => `${name}${p.slice(1)}`));
    }
    expect(problems, 'The mobile app reads these fields; re-record fixtures only if the app was updated too').toEqual([]);
  });
});
