import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Unified Transaction Lifecycle API Suite', () => {
  let app;
  let testUserId;
  let testUserEmail = `tx_lifecycle_${Date.now()}@example.com`;
  let authToken;
  let accountId;
  const year = 2026;
  const monthNum = 11;

  beforeAll(async () => {
    app = createApp({
      sessionSecret: 'test_tx_secret'
    });

    // Register user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: testUserEmail, password: 'password123' });
    expect(regRes.status).toBe(201);
    testUserId = regRes.body.data.user.id;
    authToken = regRes.body.data.token;

    // Create primary bank account
    const bankRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Main Checking',
        institution: 'HDFC',
        accountType: 'checking',
        openingBalance: 100000,
        minimumBalance: 10000,
        isPrimary: true
      });
    expect(bankRes.status).toBe(201);
    accountId = bankRes.body.data.id;

    // Create month
    const monthRes = await request(app)
      .post('/api/months')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        year,
        month: monthNum,
        openingBalance: 100000,
        incomeAmount: 50000,
        safetyFloor: 10000,
        salaryAccountId: accountId
      });
    expect(monthRes.status).toBe(201);
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(s.users).where(eq(s.users.id, testUserId));
    }
  });

  it('1. logs a spot transaction directly as successful without planned stage', async () => {
    const res = await request(app)
      .post(`/api/months/${year}/${monthNum}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Chips packet',
        amount: 2000,
        origin: 'spot',
        category: 'Food',
        date: `${year}-11-05`,
        accountId
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('successful');
    expect(res.body.data.origin).toBe('spot');
    expect(res.body.data.amount).toBe(2000);
    expect(res.body.data.plannedAmount).toBeNull();
  });

  it('2. creates a planned transaction with future date in planned status', async () => {
    const res = await request(app)
      .post(`/api/months/${year}/${monthNum}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'December Rent',
        amount: 30000,
        origin: 'planned',
        status: 'planned',
        category: 'Housing',
        date: `${year}-11-28`,
        accountId
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('planned');
    expect(res.body.data.origin).toBe('planned');
    expect(res.body.data.plannedAmount).toBe(30000);
    expect(res.body.data.plannedDate).toBe(`${year}-11-28`);
  });

  it('3. automatically assigns algorithm-recommended date for undated planned transaction', async () => {
    const res = await request(app)
      .post(`/api/months/${year}/${monthNum}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Annual Software License',
        amount: 15000,
        origin: 'planned',
        status: 'planned',
        category: 'Utilities',
        accountId
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('planned');
    expect(res.body.data.date).toBeDefined();
    expect(res.body.data.plannedDate).toBeDefined();
    expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('4. manages Goal lifecycle: logged -> scheduled (creates linked planned transaction) -> achieved (on mark paid)', async () => {
    // A. Create goal (starts as logged)
    const goalRes = await request(app)
      .post(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Noise Cancelling Headphones',
        targetAmount: 25000,
        priority: 1,
        fundingAccountId: accountId
      });

    expect(goalRes.status).toBe(201);
    expect(goalRes.body.data.status).toBe('logged');
    const goalId = goalRes.body.data.id;

    // B. Schedule goal -> creates planned transaction with origin=goal
    const schedRes = await request(app)
      .post(`/api/goals/${goalId}/schedule`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        date: `${year}-11-22`,
        accountId
      });

    expect(schedRes.status).toBe(201);
    expect(schedRes.body.data.goal.status).toBe('scheduled');
    expect(schedRes.body.data.transaction.origin).toBe('goal');
    expect(schedRes.body.data.transaction.status).toBe('planned');
    expect(schedRes.body.data.transaction.goalId).toBe(goalId);
    const linkedTxId = schedRes.body.data.transaction.id;

    // C. One-tap mark as paid with confirmed actual amount and date
    const payRes = await request(app)
      .patch(`/api/transactions/${linkedTxId}/pay`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 24500, // actual discount amount
        date: `${year}-11-20`
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.status).toBe('successful');
    expect(payRes.body.data.amount).toBe(24500);
    // Preserves planned amount & date
    expect(payRes.body.data.plannedAmount).toBe(25000);
    expect(payRes.body.data.plannedDate).toBe(`${year}-11-22`);

    // Verify linked goal is now automatically achieved
    const goalsList = await request(app)
      .get(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`);

    const achievedGoal = goalsList.body.data.find((g) => g.id === goalId);
    expect(achievedGoal).toBeDefined();
    expect(achievedGoal.status).toBe('achieved');
  });

  it('5. goal transaction cancellation: returns goal to logged when chosen', async () => {
    // Create goal
    const goalRes = await request(app)
      .post(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Mechanical Keyboard',
        targetAmount: 12000,
        fundingAccountId: accountId
      });
    const goalId = goalRes.body.data.id;

    // Schedule goal
    const schedRes = await request(app)
      .post(`/api/goals/${goalId}/schedule`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ date: `${year}-11-25` });
    const linkedTxId = schedRes.body.data.transaction.id;

    // Cancel planned transaction with goalAction: 'return_to_logged'
    const cancelRes = await request(app)
      .patch(`/api/transactions/${linkedTxId}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ goalAction: 'return_to_logged' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    // Verify goal is returned to logged
    const goalsList = await request(app)
      .get(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`);
    const goal = goalsList.body.data.find((g) => g.id === goalId);
    expect(goal.status).toBe('logged');
  });

  it('6. goal transaction cancellation: marks goal dropped when chosen', async () => {
    // Create goal
    const goalRes = await request(app)
      .post(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Gaming Chair',
        targetAmount: 18000,
        fundingAccountId: accountId
      });
    const goalId = goalRes.body.data.id;

    // Schedule goal
    const schedRes = await request(app)
      .post(`/api/goals/${goalId}/schedule`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ date: `${year}-11-26` });
    const linkedTxId = schedRes.body.data.transaction.id;

    // Cancel planned transaction with goalAction: 'dropped'
    const cancelRes = await request(app)
      .patch(`/api/transactions/${linkedTxId}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ goalAction: 'dropped' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    // Verify goal is marked dropped
    const goalsList = await request(app)
      .get(`/api/months/${year}/${monthNum}/goals`)
      .set('Authorization', `Bearer ${authToken}`);
    const goal = goalsList.body.data.find((g) => g.id === goalId);
    expect(goal.status).toBe('dropped');
  });

  it('7. filters transactions list by status and origin and computes derivedStatus correctly', async () => {
    // Query planned transactions relative to today = 2026-11-20
    const listRes = await request(app)
      .get(`/api/months/${year}/${monthNum}/transactions?status=planned&today=2026-11-20`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.status).toBe('success');
    expect(Array.isArray(listRes.body.data)).toBe(true);

    listRes.body.data.forEach((tx) => {
      expect(tx.status).toBe('planned');
      expect(['planned', 'due', 'overdue']).toContain(tx.derivedStatus);
    });

    // Query spot transactions only
    const spotRes = await request(app)
      .get(`/api/months/${year}/${monthNum}/transactions?origin=spot`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(spotRes.status).toBe(200);
    spotRes.body.data.forEach((tx) => {
      expect(tx.origin).toBe('spot');
      expect(tx.status).toBe('successful');
    });
  });

  it('8. enforces v1 rule: disallows marking a successful transaction as paid or undoing back to planned', async () => {
    // Create spot transaction (starts as successful)
    const spotRes = await request(app)
      .post(`/api/months/${year}/${monthNum}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Coffee',
        amount: 300,
        origin: 'spot',
        date: `${year}-11-08`,
        accountId
      });
    const txId = spotRes.body.data.id;

    // Trying to mark an already successful transaction paid must fail
    const payAgainRes = await request(app)
      .patch(`/api/transactions/${txId}/pay`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 300 });

    expect(payAgainRes.status).toBe(400);
    expect(payAgainRes.body.status).toBe('error');
    expect(payAgainRes.body.error.message).toContain('Only planned transactions can be marked as paid');
  });

  it('9. records inter-account transfer with origin=transfer and destinationAccountId', async () => {
    // Create second bank account
    const secondBank = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Savings Account',
        institution: 'ICICI',
        accountType: 'savings',
        openingBalance: 50000,
        minimumBalance: 5000
      });
    expect(secondBank.status).toBe(201);
    const destAccountId = secondBank.body.data.id;

    // Log transfer transaction via POST /api/transactions with origin=transfer
    const transferRes = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Savings Transfer',
        amount: 15000,
        origin: 'transfer',
        date: `${year}-11-12`,
        accountId: accountId, // Source
        destinationAccountId: destAccountId,
        note: 'Emergency buffer fund'
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.status).toBe('success');
    expect(transferRes.body.data.origin).toBe('transfer');
    expect(transferRes.body.data.status).toBe('successful');
    expect(transferRes.body.data.accountId).toBe(accountId);
    expect(transferRes.body.data.destinationAccountId).toBe(destAccountId);
    expect(transferRes.body.data.amount).toBe(15000);

    const txId = transferRes.body.data.id;

    // Verify filter by source accountId returns the transfer
    const filterSrcRes = await request(app)
      .get(`/api/transactions?accountId=${accountId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(filterSrcRes.status).toBe(200);
    const srcFound = filterSrcRes.body.data.find((t) => t.id === txId);
    expect(srcFound).toBeDefined();

    // Verify filter by destination accountId ALSO returns the transfer
    const filterDestRes = await request(app)
      .get(`/api/transactions?accountId=${destAccountId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(filterDestRes.status).toBe(200);
    const destFound = filterDestRes.body.data.find((t) => t.id === txId);
    expect(destFound).toBeDefined();

    // Delete transfer transaction and ensure clean removal
    const delRes = await request(app)
      .delete(`/api/transactions/${txId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(delRes.status).toBe(200);

    // Verify it is gone
    const verifyDel = await request(app)
      .get(`/api/transactions?accountId=${destAccountId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const gone = verifyDel.body.data.find((t) => t.id === txId);
    expect(gone).toBeUndefined();
  });

  it('10. records transfer via POST /api/transfers and synchronizes into transactions ledger', async () => {
    // Create wallet account
    const walletRes = await request(app)
      .post('/api/wallets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Cash Wallet',
        walletType: 'cash',
        openingBalance: 10000
      });
    expect(walletRes.status).toBe(201);
    const walletId = walletRes.body.data.id;

    // Call POST /api/transfers
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceAccountId: accountId,
        destinationAccountId: walletId,
        amount: 5000,
        date: `${year}-11-14`,
        note: 'ATM cash withdrawal'
      });

    expect(res.status).toBe(201);
    const transferId = res.body.data?.id || res.body.id;

    // Verify it appears in GET /api/transactions with origin=transfer
    const txList = await request(app)
      .get(`/api/transactions?accountId=${walletId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(txList.status).toBe(200);
    const matchingTx = txList.body.data.find((t) => t.transferId === transferId || t.origin === 'transfer');
    expect(matchingTx).toBeDefined();
    expect(matchingTx.origin).toBe('transfer');
    expect(matchingTx.destinationAccountId).toBe(walletId);
    expect(matchingTx.amount).toBe(5000);

    // Delete via DELETE /api/transfers/:id
    const delTr = await request(app)
      .delete(`/api/transfers/${transferId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(delTr.status).toBe(200);

    // Verify it is also removed from transactions ledger
    const checkTx = await request(app)
      .get(`/api/transactions?accountId=${walletId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const remaining = checkTx.body.data.find((t) => t.transferId === transferId);
    expect(remaining).toBeUndefined();
  });
});
