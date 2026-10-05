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
import { Transfer } from '../src/models/Transfer.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_accounts_api_test';

describe('Phase 3 - Bank Accounts, Wallets, Transfers, and Rollover API', () => {
  let app;
  let agent;
  let user;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Transfer.deleteMany({})
    ]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'phase3_test_secret',
      useMongoStore: false
    });

    agent = request.agent(app);
    const regRes = await agent
      .post('/api/auth/register')
      .send({ email: 'accounts_api@example.com', password: 'password123' });
    user = regRes.body;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Transfer.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('manages bank accounts with CRUD, primary toggle, and soft archival', async () => {
    // 1. Create primary HDFC account
    const hdfcRes = await agent.post('/api/bank-accounts').send({
      name: 'HDFC Salary Account',
      institution: 'HDFC Bank',
      accountType: 'salary',
      accountNumberMasked: '•••• 4021',
      openingBalance: 200000,
      minimumBalance: 10000,
      isPrimary: true
    });
    expect(hdfcRes.status).toBe(201);
    expect(hdfcRes.body.isPrimary).toBe(true);
    const hdfcId = hdfcRes.body._id;

    // 2. Create secondary ICICI account
    const iciciRes = await agent.post('/api/bank-accounts').send({
      name: 'ICICI Savings',
      institution: 'ICICI Bank',
      accountType: 'savings',
      openingBalance: 50000,
      isPrimary: false
    });
    expect(iciciRes.status).toBe(201);
    const iciciId = iciciRes.body._id;

    // 3. Promote ICICI to primary -> HDFC should lose primary
    const updateRes = await agent.put(`/api/bank-accounts/${iciciId}`).send({
      isPrimary: true
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.isPrimary).toBe(true);

    const listRes = await agent.get('/api/bank-accounts');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(2);
    const updatedHdfc = listRes.body.find((a) => a._id === hdfcId);
    expect(updatedHdfc.isPrimary).toBe(false);

    // 4. Soft-archive ICICI
    const delRes = await agent.delete(`/api/bank-accounts/${iciciId}`);
    expect(delRes.status).toBe(200);

    const activeList = await agent.get('/api/bank-accounts');
    expect(activeList.body).toHaveLength(1);
    expect(activeList.body[0]._id).toBe(hdfcId);

    const allList = await agent.get('/api/bank-accounts?includeArchived=true');
    expect(allList.body).toHaveLength(2);
  });

  it('manages wallets with CRUD, primary toggle, and soft archival', async () => {
    // 1. Create Cash Wallet
    const cashRes = await agent.post('/api/wallets').send({
      name: 'Physical Cash Envelope',
      walletType: 'cash',
      openingBalance: 15000,
      isPrimary: true
    });
    expect(cashRes.status).toBe(201);
    expect(cashRes.body.isPrimary).toBe(true);
    const cashId = cashRes.body._id;

    // 2. Create Paytm Wallet
    const paytmRes = await agent.post('/api/wallets').send({
      name: 'Paytm Wallet',
      walletType: 'digital',
      openingBalance: 5000,
      isPrimary: false
    });
    expect(paytmRes.status).toBe(201);
    const paytmId = paytmRes.body._id;

    // 3. List active wallets
    const listRes = await agent.get('/api/wallets');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(2);

    // 4. Soft-archive Paytm
    await agent.delete(`/api/wallets/${paytmId}`);
    const activeList = await agent.get('/api/wallets');
    expect(activeList.body).toHaveLength(1);
    expect(activeList.body[0]._id).toBe(cashId);
  });

  it('handles Paired Account Transfers and integrates seamlessly with Month simulation and rollover', async () => {
    // 1. Restore/get active bank account and wallet
    const banks = (await agent.get('/api/bank-accounts')).body;
    const wallets = (await agent.get('/api/wallets')).body;
    const hdfc = banks[0];
    const cash = wallets[0];

    // Re-activate or create a secondary bank for transfer testing
    const icici = (await agent.post('/api/bank-accounts').send({
      name: 'Axis Bank Savings',
      institution: 'Axis Bank',
      openingBalance: 50000
    })).body;

    // 2. Create month with composite opening balances
    const monthRes = await agent.post('/api/months').send({
      year: 2026,
      month: 11,
      salaryBankAccountId: hdfc._id,
      incomeAmount: 100000, // ₹1,000.00
      incomeCreditDay: 1,
      safetyFloor: 10000,
      accountOpeningBalances: [
        { accountType: 'bank', accountId: hdfc._id, amount: 200000 },
        { accountType: 'bank', accountId: icici._id, amount: 50000 },
        { accountType: 'wallet', accountId: cash._id, amount: 15000 }
      ]
    });
    expect(monthRes.status).toBe(201);
    expect(monthRes.body.openingBalance).toBe(265000); // 200k + 50k + 15k
    const monthId = monthRes.body._id;

    // 3. Add planned recurring rent item attributed to HDFC (fixed recurring)
    const itemRes = await agent.post('/api/months/2026/11/items').send({
      type: 'recurring',
      name: 'Apartment Rent',
      amount: 80000,
      dayOfMonth: 5,
      isFixed: true,
      accountType: 'bank',
      bankAccountId: hdfc._id
    });
    expect(itemRes.status).toBe(201);
    expect(itemRes.body.bankAccountId).toBe(hdfc._id);

    // 4. Create Paired Account Transfer of ₹20,000 from Axis Bank to Cash Wallet
    const transferRes = await agent.post('/api/transfers').send({
      monthId,
      date: '2026-11-04',
      amount: 20000,
      sourceType: 'bank',
      sourceBankAccountId: icici._id,
      destinationType: 'wallet',
      destinationWalletId: cash._id,
      note: 'ATM cash withdrawal'
    });
    expect(transferRes.status).toBe(201);
    expect(transferRes.body.amount).toBe(20000);

    // Verify transfer validation rejects identical source and destination
    const badTransfer = await agent.post('/api/transfers').send({
      monthId,
      date: '2026-11-04',
      amount: 5000,
      sourceType: 'bank',
      sourceBankAccountId: icici._id,
      destinationType: 'bank',
      destinationBankAccountId: icici._id
    });
    expect(badTransfer.status).toBe(400);

    // 5. Add cash grocery expense on Cash Wallet
    const txRes = await agent.post('/api/months/2026/11/transactions').send({
      date: '2026-11-06',
      amount: 10000,
      tag: 'Food',
      note: 'Farmer market veggies',
      accountType: 'wallet',
      walletId: cash._id
    });
    expect(txRes.status).toBe(201);

    // 6. Fetch month details and verify simulation payload
    const getMonthRes = await agent.get('/api/months/2026/11');
    expect(getMonthRes.status).toBe(200);
    const { simulation, transfers: fetchedTransfers } = getMonthRes.body;
    expect(fetchedTransfers).toHaveLength(1);

    // Aggregate ending: 265k + 100k salary - 80k rent - 10k veggies = 275k
    expect(simulation.endingBalance).toBe(275000);

    // Account ending balances:
    // HDFC: 200k opening + 100k salary - 80k rent = 220k
    expect(simulation.accounts[hdfc._id].endingBalance).toBe(220000);

    // Axis (ICICI variable): 50k opening - 20k transfer = 30k
    expect(simulation.accounts[icici._id].endingBalance).toBe(30000);

    // Cash: 15k opening + 20k transfer - 10k veggies = 25k
    expect(simulation.accounts[cash._id].endingBalance).toBe(25000);

    // 7. Perform Month Rollover to December 2026 with carryBalance: true
    const rolloverRes = await agent.post('/api/months/2026/11/rollover').send({
      carryBalance: true
    });
    expect(rolloverRes.status).toBe(201);
    expect(rolloverRes.body.month.year).toBe(2026);
    expect(rolloverRes.body.month.month).toBe(12);

    // Total opening balance carries forward
    expect(rolloverRes.body.month.openingBalance).toBe(275000);

    // Per-account opening balances carried forward
    const carriedAccountOpenings = rolloverRes.body.month.accountOpeningBalances;
    expect(carriedAccountOpenings).toBeDefined();
    const carriedHdfc = carriedAccountOpenings.find((a) => a.accountId === hdfc._id);
    const carriedAxis = carriedAccountOpenings.find((a) => a.accountId === icici._id);
    const carriedCash = carriedAccountOpenings.find((a) => a.accountId === cash._id);
    expect(carriedHdfc.amount).toBe(220000);
    expect(carriedAxis.amount).toBe(30000);
    expect(carriedCash.amount).toBe(25000);

    // Fixed recurring rent item copied to December with account attribution intact
    const decRentItem = rolloverRes.body.items.find((i) => i.name === 'Apartment Rent');
    expect(decRentItem).toBeDefined();
    expect(decRentItem.bankAccountId).toBe(hdfc._id);
    expect(decRentItem.accountType).toBe('bank');
  });

  it('automatically defaults transaction to primary bank and backfills unassigned transactions', async () => {
    // 1. Create a fresh test user
    const newUserAgent = request.agent(app);
    const regRes = await newUserAgent
      .post('/api/auth/register')
      .send({ email: 'backfill_test@example.com', password: 'password123' });
    expect(regRes.status).toBe(201);
    const testUserId = regRes.body.user.id;

    // 2. Create a month for 2026/10
    const monthRes = await newUserAgent.post('/api/months').send({
      year: 2026,
      month: 10,
      openingBalance: 100000,
      incomeAmount: 50000,
      incomeCreditDay: 1
    });
    expect(monthRes.status).toBe(201);

    // 3. Create a primary bank account
    const bankRes = await newUserAgent.post('/api/bank-accounts').send({
      name: 'Salary Checking Account',
      institution: 'State Bank',
      accountType: 'checking',
      openingBalance: 100000,
      isPrimary: true
    });
    expect(bankRes.status).toBe(201);
    const bankId = bankRes.body._id;

    // 4. Log a transaction without providing accountType or bankAccountId
    const txRes1 = await newUserAgent.post('/api/months/2026/10/transactions').send({
      date: '2026-10-02',
      amount: 15000,
      tag: 'Food',
      note: 'Lunch'
    });
    expect(txRes1.status).toBe(201);
    // Should auto-default to primary bank
    expect(txRes1.body.accountType).toBe('bank');
    expect(String(txRes1.body.bankAccountId)).toBe(String(bankId));

    // 5. Directly insert a legacy unassigned transaction in the DB
    const legacyTx = await Transaction.create({
      userId: testUserId,
      monthId: monthRes.body._id,
      date: '2026-10-03',
      amount: 25000,
      tag: 'Travel',
      note: 'Train Ticket',
      accountType: null,
      bankAccountId: null
    });
    expect(legacyTx.bankAccountId).toBeNull();

    // 6. Fetch the month -> automatic backfill should run
    const getMonthRes = await newUserAgent.get('/api/months/2026/10');
    expect(getMonthRes.status).toBe(200);

    // Check DB that legacyTx was backfilled to primary bank
    const updatedLegacyTx = await Transaction.findById(legacyTx._id);
    expect(updatedLegacyTx.accountType).toBe('bank');
    expect(String(updatedLegacyTx.bankAccountId)).toBe(String(bankId));

    // 7. Verify simulation cuts down the bank account balance
    const bankAcc = getMonthRes.body.simulation.accounts[bankId];
    expect(bankAcc).toBeDefined();
    // Opening: 100,000 + 50,000 income - 15,000 tx1 - 25,000 legacyTx = 110,000 ending
    expect(bankAcc.endingBalance).toBe(110000);

    // 8. Create a planned item without providing accountType or bankAccountId
    const itemRes1 = await newUserAgent.post('/api/months/2026/10/items').send({
      name: 'Internet Bill',
      type: 'one-time',
      amount: 10000,
      day: 15
    });
    expect(itemRes1.status).toBe(201);
    expect(itemRes1.body.accountType).toBe('bank');
    expect(String(itemRes1.body.bankAccountId)).toBe(String(bankId));

    // 9. Directly insert a legacy unassigned item in the DB
    const legacyItem = await Item.create({
      userId: testUserId,
      monthId: monthRes.body._id,
      name: 'Old Unassigned Item',
      type: 'one-time',
      amount: 20000,
      day: 20,
      accountType: null,
      bankAccountId: null
    });

    // 10. Fetch month again -> legacyItem should be backfilled to primary bank
    const getMonthRes2 = await newUserAgent.get('/api/months/2026/10');
    expect(getMonthRes2.status).toBe(200);

    const updatedLegacyItem = await Item.findById(legacyItem._id);
    expect(updatedLegacyItem.accountType).toBe('bank');
    expect(String(updatedLegacyItem.bankAccountId)).toBe(String(bankId));

    // Bank ending balance should now also reflect the planned items:
    // 110,000 - 10,000 (item1) - 20,000 (legacyItem) = 80,000
    const bankAccAfterItems = getMonthRes2.body.simulation.accounts[bankId];
    expect(bankAccAfterItems.endingBalance).toBe(80000);

    // 11. Reject explicit unassigned accountType per ADR 0035
    const badItemRes = await newUserAgent.post('/api/months/2026/10/items').send({
      name: 'Unassigned Item Test',
      type: 'one-time',
      amount: 5000,
      day: 12,
      accountType: 'unassigned'
    });
    expect(badItemRes.status).toBe(400);

    const badTxRes = await newUserAgent.post('/api/months/2026/10/transactions').send({
      amount: 5000,
      tag: 'Food',
      date: '2026-10-12',
      accountType: 'unassigned'
    });
    expect(badTxRes.status).toBe(400);

    // 12. Add a second bank account, link matched transaction, update item, and verify sync
    const bank2Res = await newUserAgent.post('/api/bank-accounts').send({
      name: 'Secondary Savings',
      institution: 'HDFC Bank',
      accountType: 'savings',
      openingBalance: 50000
    });
    expect(bank2Res.status).toBe(201);
    const bank2Id = bank2Res.body._id;

    // Log a transaction matched to itemRes1
    const matchedTxRes = await newUserAgent.post('/api/months/2026/10/transactions').send({
      amount: 10000,
      tag: 'Other',
      date: '2026-10-15',
      plannedItemId: itemRes1.body._id
    });
    expect(matchedTxRes.status).toBe(201);
    expect(String(matchedTxRes.body.bankAccountId)).toBe(String(bankId));

    // Update itemRes1 to bank2
    const updateItemRes = await newUserAgent.put(`/api/items/${itemRes1.body._id}`).send({
      accountType: 'bank',
      bankAccountId: bank2Id
    });
    expect(updateItemRes.status).toBe(200);
    expect(String(updateItemRes.body.bankAccountId)).toBe(String(bank2Id));

    // Verify matched transaction was synchronized to bank2
    const updatedMatchedTx = await Transaction.findById(matchedTxRes.body._id);
    expect(String(updatedMatchedTx.bankAccountId)).toBe(String(bank2Id));
  });
});
