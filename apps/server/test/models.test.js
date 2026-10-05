import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Month } from '../src/models/Month.js';
import { Item } from '../src/models/Item.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';
import { BankAccount } from '../src/models/BankAccount.js';
import { Wallet } from '../src/models/Wallet.js';
import { Transfer } from '../src/models/Transfer.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_models_test';

describe('Phase 1 - Bank Account, Wallet, and Transfer Domain Models', () => {
  let user;
  let month;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      Goal.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Transfer.deleteMany({})
    ]);

    user = await User.create({
      email: 'models_test@example.com',
      passwordHash: 'dummyhash'
    });

    month = await Month.create({
      userId: user._id,
      year: 2026,
      month: 10,
      openingBalance: 500000,
      incomeAmount: 300000,
      safetyFloor: 50000
    });
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      Goal.deleteMany({}),
      BankAccount.deleteMany({}),
      Wallet.deleteMany({}),
      Transfer.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('creates BankAccount with institutional attributes, minimum balance, and primary flag', async () => {
    const bank = await BankAccount.create({
      userId: user._id,
      name: 'HDFC Salary Account',
      institution: 'HDFC Bank',
      accountType: 'salary',
      accountNumberMasked: '•••• 4021',
      openingBalance: 250000,
      minimumBalance: 10000,
      isPrimary: true
    });

    expect(bank._id).toBeDefined();
    expect(bank.name).toBe('HDFC Salary Account');
    expect(bank.accountType).toBe('salary');
    expect(bank.minimumBalance).toBe(10000);
    expect(bank.isPrimary).toBe(true);
    expect(bank.isArchived).toBe(false);
  });

  it('creates Wallet with cash/digital type and primary flag', async () => {
    const wallet = await Wallet.create({
      userId: user._id,
      name: 'Physical Cash Wallet',
      walletType: 'cash',
      openingBalance: 5000,
      isPrimary: true
    });

    expect(wallet._id).toBeDefined();
    expect(wallet.name).toBe('Physical Cash Wallet');
    expect(wallet.walletType).toBe('cash');
    expect(wallet.openingBalance).toBe(5000);
    expect(wallet.isPrimary).toBe(true);
    expect(wallet.isArchived).toBe(false);
  });

  it('creates Paired Account Transfer linking bank and wallet', async () => {
    const bank = await BankAccount.create({
      userId: user._id,
      name: 'Savings Bank',
      openingBalance: 100000
    });
    const wallet = await Wallet.create({
      userId: user._id,
      name: 'Cash Pocket',
      openingBalance: 0
    });

    const transfer = await Transfer.create({
      userId: user._id,
      monthId: month._id,
      date: '2026-10-05',
      amount: 20000,
      sourceType: 'bank',
      sourceBankAccountId: bank._id,
      destinationType: 'wallet',
      destinationWalletId: wallet._id,
      note: 'ATM cash withdrawal'
    });

    expect(transfer._id).toBeDefined();
    expect(transfer.amount).toBe(20000);
    expect(transfer.sourceType).toBe('bank');
    expect(transfer.sourceBankAccountId.toString()).toBe(bank._id.toString());
    expect(transfer.destinationType).toBe('wallet');
    expect(transfer.destinationWalletId.toString()).toBe(wallet._id.toString());
  });

  it('supports account attribution on Item and Transaction', async () => {
    const bank = await BankAccount.create({
      userId: user._id,
      name: 'Credit Card Linked Account',
      openingBalance: 50000
    });

    const item = await Item.create({
      userId: user._id,
      monthId: month._id,
      type: 'recurring',
      name: 'Broadband Fiber',
      amount: 120000,
      dayOfMonth: 10,
      accountType: 'bank',
      bankAccountId: bank._id
    });

    expect(item.accountType).toBe('bank');
    expect(item.bankAccountId.toString()).toBe(bank._id.toString());

    const tx = await Transaction.create({
      userId: user._id,
      monthId: month._id,
      date: '2026-10-10',
      amount: 120000,
      tag: 'Other',
      plannedItemId: item._id,
      accountType: 'bank',
      bankAccountId: bank._id,
      isIncome: false
    });

    expect(tx.accountType).toBe('bank');
    expect(tx.bankAccountId.toString()).toBe(bank._id.toString());
    expect(tx.isIncome).toBe(false);
  });

  it('supports salaryBankAccountId and accountOpeningBalances on Month', async () => {
    const salaryBank = await BankAccount.create({
      userId: user._id,
      name: 'Primary Salary Depository',
      openingBalance: 300000
    });
    const cashWallet = await Wallet.create({
      userId: user._id,
      name: 'Petty Cash Envelope',
      openingBalance: 50000
    });

    const updatedMonth = await Month.findByIdAndUpdate(
      month._id,
      {
        salaryBankAccountId: salaryBank._id,
        accountOpeningBalances: [
          { accountType: 'bank', accountId: salaryBank._id, amount: 300000 },
          { accountType: 'wallet', accountId: cashWallet._id, amount: 50000 }
        ]
      },
      { new: true }
    );

    expect(updatedMonth.salaryBankAccountId.toString()).toBe(salaryBank._id.toString());
    expect(updatedMonth.accountOpeningBalances).toHaveLength(2);
    expect(updatedMonth.accountOpeningBalances[0].amount).toBe(300000);
    expect(updatedMonth.accountOpeningBalances[1].amount).toBe(50000);
  });

  it('supports funding source attribution on Goal', async () => {
    const savingsBank = await BankAccount.create({
      userId: user._id,
      name: 'Dream Vault Savings',
      openingBalance: 500000
    });

    const goal = await Goal.create({
      userId: user._id,
      monthId: month._id,
      name: 'Noise-Cancelling Headphones',
      targetAmount: 2500000,
      fundingSourceType: 'bank',
      fundingBankAccountId: savingsBank._id
    });

    expect(goal.fundingSourceType).toBe('bank');
    expect(goal.fundingBankAccountId.toString()).toBe(savingsBank._id.toString());
  });
});
