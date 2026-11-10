import { describe, it, expect, beforeAll } from 'vitest';
import { db, ensureDatabaseInitialized, pool } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';
import { SimulationService } from '../src/domain/simulationService.js';
import { LedgerService } from '../src/domain/ledgerService.js';
import { pruneEmptyFutureMonths } from '../src/db/index.js';

describe('Planned Transactions and Months Lifecycle Integration', () => {
  let testUserId;
  let testAccountId;
  let currentMonthId;
  let futureMonthId;

  beforeAll(async () => {
    await ensureDatabaseInitialized();

    // 1. Create a clean test user
    const [user] = await db.insert(s.users).values({
      email: `test_lifecycle_${Date.now()}@example.com`,
      passwordHash: 'hash123'
    }).returning();
    testUserId = user.id;

    // 2. Create primary bank account with initial opening balance
    const [account] = await db.insert(s.accounts).values({
      userId: testUserId,
      name: 'Primary Checking',
      type: 'bank',
      subtype: 'checking',
      institution: 'Test Bank',
      openingBalance: 5000000, // ₹50,000
      currentBalance: 5000000,
      minimumBalance: 1000000, // ₹10,000
      isPrimary: true
    }).returning();
    testAccountId = account.id;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curMonthStr = String(curMonth).padStart(2, '0');

    // 3. Create current month
    const [cMonth] = await db.insert(s.months).values({
      userId: testUserId,
      year: curYear,
      month: curMonth,
      startDate: `${curYear}-${curMonthStr}-01`,
      endDate: `${curYear}-${curMonthStr}-28`,
      openingBalance: 5000000,
      incomeAmount: 10000000,
      salaryAccountId: testAccountId,
      safetyFloor: 1000000,
      isClosed: false
    }).returning();
    currentMonthId = cMonth.id;

    // 4. Create future preview month (e.g. Next Year / Next Month)
    const nextYear = curMonth === 12 ? curYear + 1 : curYear;
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const nextMonthStr = String(nextMonth).padStart(2, '0');

    const [fMonth] = await db.insert(s.months).values({
      userId: testUserId,
      year: nextYear,
      month: nextMonth,
      startDate: `${nextYear}-${nextMonthStr}-01`,
      endDate: `${nextYear}-${nextMonthStr}-28`,
      openingBalance: 4000000,
      incomeAmount: 10000000,
      salaryAccountId: testAccountId,
      safetyFloor: 1000000,
      isClosed: false
    }).returning();
    futureMonthId = fMonth.id;

    // 5. Insert planned item in items table for current month
    await db.insert(s.items).values({
      userId: testUserId,
      monthId: currentMonthId,
      type: 'recurring',
      name: 'Fiber Internet',
      category: 'Utilities',
      amount: 150000, // ₹1,500
      date: `${curYear}-${curMonthStr}-10`,
      accountId: testAccountId,
      isPaid: false
    });

    // 6. Insert planned item in future month
    await db.insert(s.items).values({
      userId: testUserId,
      monthId: futureMonthId,
      type: 'one-time',
      name: 'Annual Insurance',
      category: 'Insurance',
      amount: 1200000, // ₹12,000
      date: `${nextYear}-${nextMonthStr}-15`,
      accountId: testAccountId,
      isPaid: false
    });

    // 7. Insert an actual successful transaction
    await db.insert(s.transactions).values({
      userId: testUserId,
      monthId: currentMonthId,
      name: 'Grocery Store',
      status: 'successful',
      origin: 'spot',
      amount: 300000, // ₹3,000
      date: `${curYear}-${curMonthStr}-05`,
      accountId: testAccountId
    });
  });

  it('getMonthDetails returns planned items in both res.items and res.transactions', async () => {
    const now = new Date();
    const details = await MonthLifecycle.getMonthDetails(testUserId, now.getFullYear(), now.getMonth() + 1);

    expect(details.items).toBeDefined();
    expect(details.items.length).toBeGreaterThanOrEqual(1);
    expect(details.items.some(i => i.name === 'Fiber Internet')).toBe(true);

    expect(details.transactions).toBeDefined();
    const plannedTxs = details.transactions.filter(t => t.status === 'planned');
    expect(plannedTxs.some(t => t.name === 'Fiber Internet')).toBe(true);

    // Simulation should include planned expense event
    expect(details.simulation).toBeDefined();
    expect(details.simulation.events.some(e => e.name === 'Fiber Internet')).toBe(true);
  });

  it('pruneEmptyFutureMonths preserves future preview months that contain planned items or openings', async () => {
    await pruneEmptyFutureMonths();

    const futureMonth = await db.query.months.findFirst({
      where: s.months.id ? (s.months.id, futureMonthId) : undefined
    });

    // Future preview month must not be deleted!
    const check = await pool.query('SELECT id FROM months WHERE id = $1', [futureMonthId]);
    expect(check.rows.length).toBe(1);
  });

  it('LedgerService.recomputeAccountBalance correctly updates materialized current_balance', async () => {
    await LedgerService.recomputeAccountBalance(testAccountId);

    const check = await pool.query('SELECT current_balance, opening_balance FROM accounts WHERE id = $1', [testAccountId]);
    const row = check.rows[0];
    // opening was 5000000, grocery was 300000 expense -> 4700000
    expect(Number(row.current_balance)).toBe(4700000);
  });
});
