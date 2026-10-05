import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Month } from '../src/models/Month.js';
import { Item } from '../src/models/Item.js';
import { Transaction } from '../src/models/Transaction.js';
import { BankAccount } from '../src/models/BankAccount.js';
import { Wallet } from '../src/models/Wallet.js';
import { Goal } from '../src/models/Goal.js';
import { Setting } from '../src/models/Setting.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_migration_test';

describe('User-Consented Primary Bank Account Data Migration', () => {
  let app;
  let agent;
  let legacyUser;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Goal.deleteMany({})
    ]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'migration_test_secret',
      useMongoStore: false
    });

    agent = request.agent(app);
    const regRes = await agent
      .post('/api/auth/register')
      .send({ email: 'legacy_user@example.com', password: 'password123' });
    legacyUser = regRes.body.user;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Goal.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('detects migration eligibility and stats without silently mutating data', async () => {
    // 1. Seed legacy data with NO bank accounts
    const legacyMonth = await Month.create({
      userId: legacyUser.id,
      year: 2026,
      month: 9,
      openingBalance: 4000000,
      incomeAmount: 5000000,
      safetyFloor: 1000000,
      salaryBankAccountId: null,
      accountOpeningBalances: []
    });

    const legacyItem = await Item.create({
      userId: legacyUser.id,
      monthId: legacyMonth._id,
      name: 'Internet Fiber',
      type: 'recurring',
      amount: 150000,
      dayOfMonth: 5
    });

    const legacyTx = await Transaction.create({
      userId: legacyUser.id,
      monthId: legacyMonth._id,
      amount: 80000,
      date: '2026-09-02',
      tag: 'Food'
    });

    const legacyGoal = await Goal.create({
      userId: legacyUser.id,
      monthId: legacyMonth._id,
      name: 'Ergonomic Desk',
      targetAmount: 3000000
    });

    // Verify 0 bank accounts currently exist
    const initialBanks = await BankAccount.find({ userId: legacyUser.id });
    expect(initialBanks.length).toBe(0);

    // Calling GET /api/bank-accounts must NOT auto-provision
    const getAccountsRes = await agent.get('/api/bank-accounts');
    expect(getAccountsRes.status).toBe(200);
    expect(getAccountsRes.body.length).toBe(0);

    // 2. Client checks migration eligibility
    const statusRes = await agent.get('/api/bank-accounts/migration-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.eligible).toBe(true);
    expect(statusRes.body.stats).toEqual({
      monthCount: 1,
      itemCount: 1,
      transactionCount: 1,
      goalCount: 1,
      currentOpeningBalance: 4000000,
      currentIncomeAmount: 5000000,
      incomeCreditDate: null,
      incomeCreditDay: 1
    });

    // 3. Reject migration if name is missing
    const invalidMigrateRes = await agent
      .post('/api/bank-accounts/migrate')
      .send({ institution: 'HDFC' });
    expect(invalidMigrateRes.status).toBe(400);

    // 4. Execute user-consented migration with customized inputs
    const migrateRes = await agent
      .post('/api/bank-accounts/migrate')
      .send({
        name: 'HDFC Salary Account',
        institution: 'HDFC Bank',
        accountType: 'salary',
        accountNumberLast4: '4321',
        minimumBalance: 500000
      });

    expect(migrateRes.status).toBe(201);
    expect(migrateRes.body.bankAccount).toBeDefined();

    const primaryBank = migrateRes.body.bankAccount;
    expect(primaryBank.name).toBe('HDFC Salary Account');
    expect(primaryBank.institution).toBe('HDFC Bank');
    expect(primaryBank.accountType).toBe('salary');
    expect(primaryBank.accountNumberMasked).toBe('•••• 4321');
    expect(primaryBank.isPrimary).toBe(true);
    expect(primaryBank.openingBalance).toBe(4000000);
    expect(primaryBank.minimumBalance).toBe(500000);

    // 5. Verify Month was backfilled
    const updatedMonth = await Month.findById(legacyMonth._id);
    expect(updatedMonth.salaryBankAccountId?.toString()).toBe(primaryBank._id);
    expect(updatedMonth.accountOpeningBalances.length).toBe(1);
    expect(updatedMonth.accountOpeningBalances[0].accountId?.toString()).toBe(primaryBank._id);
    expect(updatedMonth.accountOpeningBalances[0].amount).toBe(4000000);

    // 6. Verify Item was backfilled
    const updatedItem = await Item.findById(legacyItem._id);
    expect(updatedItem.accountType).toBe('bank');
    expect(updatedItem.bankAccountId?.toString()).toBe(primaryBank._id);

    // 7. Verify Transaction was backfilled
    const updatedTx = await Transaction.findById(legacyTx._id);
    expect(updatedTx.accountType).toBe('bank');
    expect(updatedTx.bankAccountId?.toString()).toBe(primaryBank._id);

    // 8. Verify Goal was backfilled
    const updatedGoal = await Goal.findById(legacyGoal._id);
    expect(updatedGoal.fundingSourceType).toBe('bank');
    expect(updatedGoal.fundingBankAccountId?.toString()).toBe(primaryBank._id);

    // 9. Verify Setting was updated with defaultSalaryBankAccountId
    const updatedSettings = await Setting.findOne({ userId: legacyUser.id });
    expect(updatedSettings?.defaultSalaryBankAccountId?.toString()).toBe(primaryBank._id);

    // 9. Subsequent check shows not eligible
    const postStatusRes = await agent.get('/api/bank-accounts/migration-status');
    expect(postStatusRes.status).toBe(200);
    expect(postStatusRes.body.eligible).toBe(false);

    // 10. Attempting migration again fails
    const reMigrateRes = await agent
      .post('/api/bank-accounts/migrate')
      .send({ name: 'Another Checking' });
    expect(reMigrateRes.status).toBe(400);
  });

  it('bypasses migration eligibility if user already has a wallet', async () => {
    const anotherAgent = request.agent(app);
    const regRes = await anotherAgent
      .post('/api/auth/register')
      .send({ email: 'existing_wallet_user@example.com', password: 'password123' });
    const user2 = regRes.body.user;

    // Create month
    const m = await Month.create({
      userId: user2.id,
      year: 2026,
      month: 10,
      openingBalance: 100000
    });

    // Create a wallet manually
    await Wallet.create({
      userId: user2.id,
      name: 'Petty Cash',
      walletType: 'cash',
      openingBalance: 50000
    });

    // Create an item with no account
    const item = await Item.create({
      userId: user2.id,
      monthId: m._id,
      name: 'Unassigned Item',
      type: 'one-time',
      amount: 20000,
      day: 10
    });

    // Migration status check
    const statusRes = await anotherAgent.get('/api/bank-accounts/migration-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.eligible).toBe(false);

    // Item should remain unassigned
    const preservedItem = await Item.findById(item._id);
    expect(preservedItem.accountType).toBeFalsy();
    expect(preservedItem.bankAccountId).toBeFalsy();
  });

  it('does not offer migration to fresh users with zero legacy records', async () => {
    const freshAgent = request.agent(app);
    const regRes = await freshAgent
      .post('/api/auth/register')
      .send({ email: 'fresh_user@example.com', password: 'password123' });
    const freshUser = regRes.body.user;

    const statusRes = await freshAgent.get('/api/bank-accounts/migration-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.eligible).toBe(false);

    const freshBanks = await BankAccount.find({ userId: freshUser.id });
    expect(freshBanks.length).toBe(0);
  });
});
