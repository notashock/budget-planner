import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, ensureDatabaseInitialized, pool } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';
import { SimulationService } from '../src/domain/simulationService.js';
import { LedgerService } from '../src/domain/ledgerService.js';
import { BudgetExecution } from '../src/domain/budgetExecution.js';
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
      where: eq(s.months.id, futureMonthId)
    });

    // Future preview month must not be deleted!
    const check = await pool.query('SELECT id FROM months WHERE id = $1', [futureMonthId]);
    expect(check.rows.length).toBe(1);
    expect(futureMonth).toBeDefined();
    expect(futureMonth.id).toBe(futureMonthId);
  });

  it('LedgerService.recomputeAccountBalance correctly updates materialized current_balance', async () => {
    await LedgerService.recomputeAccountBalance(testAccountId);

    const check = await pool.query('SELECT current_balance, opening_balance FROM accounts WHERE id = $1', [testAccountId]);
    const row = check.rows[0];
    // opening was 5000000, grocery was 300000 expense -> 4700000
    expect(Number(row.current_balance)).toBe(4700000);
  });

  it('polymorphically deletes a planned item directly by its id and ensures idempotency', async () => {
    // 1. Create a planned item in items table
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curMonthStr = String(curMonth).padStart(2, '0');

    const [item] = await db.insert(s.items).values({
      userId: testUserId,
      monthId: currentMonthId,
      type: 'recurring',
      name: 'Gym Membership',
      category: 'Fitness',
      amount: 250000, // ₹2,500
      date: `${curYear}-${curMonthStr}-18`,
      accountId: testAccountId,
      isPaid: false
    }).returning();

    // Verify it exists in items and not in transactions
    const beforeItem = await db.query.items.findFirst({ where: eq(s.items.id, item.id) });
    expect(beforeItem).toBeDefined();
    const beforeTx = await db.query.transactions.findFirst({ where: eq(s.transactions.id, item.id) });
    expect(beforeTx).toBeUndefined();

    // 2. Call BudgetExecution.deleteTransaction using the item's ID
    const deleteRes = await BudgetExecution.deleteTransaction(testUserId, item.id);
    expect(deleteRes.message).toBe('Transaction deleted successfully');

    // Verify it is completely removed from items table
    const afterItem = await db.query.items.findFirst({ where: eq(s.items.id, item.id) });
    expect(afterItem).toBeUndefined();

    // 3. Test Idempotency: deleting the same ID again must succeed without error
    const idempotentRes = await BudgetExecution.deleteTransaction(testUserId, item.id);
    expect(idempotentRes.message).toBe('Transaction already removed');
  });

  it('deleting a paid planned transaction cleans both tables and reverses balance', async () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curMonthStr = String(curMonth).padStart(2, '0');

    // 1. Create an item
    const [item] = await db.insert(s.items).values({
      userId: testUserId,
      monthId: currentMonthId,
      type: 'one-time',
      name: 'Conference Ticket',
      category: 'Education',
      amount: 500000, // ₹5,000
      date: `${curYear}-${curMonthStr}-20`,
      accountId: testAccountId,
      isPaid: false
    }).returning();

    // Record initial balance
    const [accBefore] = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [testAccountId]).then(r => r.rows);
    const balanceBeforePay = Number(accBefore.current_balance);

    // 2. Pay the planned item via BudgetExecution.markTransactionPaid
    const paidTx = await BudgetExecution.markTransactionPaid(testUserId, item.id, {
      amount: 500000,
      date: `${curYear}-${curMonthStr}-20`,
      accountId: testAccountId
    });
    expect(paidTx.status).toBe('successful');

    // Balance should have decreased by 500000
    const [accPaid] = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [testAccountId]).then(r => r.rows);
    expect(Number(accPaid.current_balance)).toBe(balanceBeforePay - 500000);

    // 3. Delete the transaction
    const deleteRes = await BudgetExecution.deleteTransaction(testUserId, paidTx.id);
    expect(deleteRes.message).toBe('Transaction deleted successfully');

    // Both transaction and item must be gone
    const checkTx = await db.query.transactions.findFirst({ where: eq(s.transactions.id, paidTx.id) });
    expect(checkTx).toBeUndefined();
    const checkItem = await db.query.items.findFirst({ where: eq(s.items.id, item.id) });
    expect(checkItem).toBeUndefined();

    // Materialized balance must be reversed!
    const [accAfter] = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [testAccountId]).then(r => r.rows);
    expect(Number(accAfter.current_balance)).toBe(balanceBeforePay);
  });
});
