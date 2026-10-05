import { describe, it, expect } from 'vitest';
import { simulate, recommendPurchaseDate, evaluateGoalsWithReservation } from '../src/index.js';

describe('Phase 2 - Multi-Account & Wallet Simulation Engine', () => {
  const bankHDFC = {
    id: 'bank-hdfc',
    name: 'HDFC Salary Account',
    type: 'bank',
    institution: 'HDFC Bank',
    accountType: 'salary',
    accountNumberMasked: '•••• 4021',
    openingBalance: 200000, // ₹2,000.00
    minimumBalance: 10000,  // ₹100.00 MAB
    isPrimary: true
  };

  const bankICICI = {
    id: 'bank-icici',
    name: 'ICICI Savings Account',
    type: 'bank',
    institution: 'ICICI Bank',
    accountType: 'savings',
    accountNumberMasked: '•••• 8820',
    openingBalance: 50000, // ₹500.00
    minimumBalance: 5000,
    isPrimary: false
  };

  const walletCash = {
    id: 'wallet-cash',
    name: 'Physical Cash',
    type: 'wallet',
    walletType: 'cash',
    openingBalance: 10000, // ₹100.00
    isPrimary: true
  };

  const accounts = [bankHDFC, bankICICI, walletCash];

  it('computes unified aggregate simulation and individual account balance trajectories', () => {
    const settings = {
      openingBalance: 260000, // 200k + 50k + 10k
      incomeAmount: 100000,   // ₹1,000.00 salary
      incomeCreditDay: 1,
      salaryBankAccountId: 'bank-hdfc',
      safetyFloor: 20000,
      unplannedAllowance: 10000,
      currentDay: 15,
      accounts,
      accountOpeningBalances: [
        { accountId: 'bank-hdfc', amount: 200000 },
        { accountId: 'bank-icici', amount: 50000 },
        { accountId: 'wallet-cash', amount: 10000 }
      ]
    };

    const items = [
      {
        id: 'item-rent',
        name: 'House Rent',
        type: 'recurring',
        amount: 80000,
        dayOfMonth: 5,
        accountType: 'bank',
        bankAccountId: 'bank-hdfc'
      },
      {
        id: 'item-groceries',
        name: 'Weekly Cash Groceries',
        type: 'one-time',
        amount: 15000,
        day: 8,
        accountType: 'wallet',
        walletId: 'wallet-cash'
      }
    ];

    const result = simulate(settings, items, { year: 2026, month: 10 });

    // Aggregate checks: 260k + 100k income - 80k rent - 15k groceries = 265k ending
    expect(result.endingBalance).toBe(265000);
    expect(result.floorBreached).toBe(false);

    // Per-Account checks:
    const hdfc = result.accounts['bank-hdfc'];
    expect(hdfc).toBeDefined();
    // HDFC: 200k opening + 100k salary - 80k rent = 220k
    expect(hdfc.endingBalance).toBe(220000);
    expect(hdfc.floorBreached).toBe(false);

    const icici = result.accounts['bank-icici'];
    expect(icici).toBeDefined();
    // ICICI: untouched 50k
    expect(icici.endingBalance).toBe(50000);
    expect(icici.floorBreached).toBe(false);

    const cash = result.accounts['wallet-cash'];
    expect(cash).toBeDefined();
    // Cash: 10k opening - 15k groceries = -5k (negative overdraft)
    expect(cash.endingBalance).toBe(-5000);
    expect(cash.floorBreached).toBe(true); // < 0

    // Account daily balances check
    expect(result.accountDailyBalances['bank-hdfc']).toHaveLength(31);
    expect(result.accountDailyBalances['wallet-cash']).toHaveLength(31);
  });

  it('processes Paired Account Transfers as zero-sum aggregate events that balance accounts', () => {
    const settings = {
      openingBalance: 260000,
      safetyFloor: 20000,
      currentDay: 10,
      accounts
    };

    const items = [
      {
        id: 'item-groceries',
        name: 'Cash Groceries',
        type: 'one-time',
        amount: 15000,
        day: 8,
        accountType: 'wallet',
        walletId: 'wallet-cash'
      }
    ];

    // Transfer ₹20,000 from ICICI Bank to Cash Wallet on Day 4
    const transfers = [
      {
        id: 'tr-1',
        date: '2026-10-04',
        amount: 20000,
        sourceType: 'bank',
        sourceBankAccountId: 'bank-icici',
        destinationType: 'wallet',
        destinationWalletId: 'wallet-cash',
        note: 'ATM cash withdrawal for groceries'
      }
    ];

    const result = simulate(settings, items, { year: 2026, month: 10 }, [], [], transfers);

    // Aggregate balance should be 260k - 15k = 245k (Transfer has NO net effect on total cash)
    expect(result.endingBalance).toBe(245000);

    // Verify transfer event in timeline has amount: 0
    const trEvt = result.events.find((e) => e.itemType === 'transfer');
    expect(trEvt).toBeDefined();
    expect(trEvt.amount).toBe(0);
    expect(trEvt.transferAmount).toBe(20000);

    // Individual accounts:
    // ICICI: 50k - 20k transfer = 30k
    expect(result.accounts['bank-icici'].endingBalance).toBe(30000);

    // Cash Wallet: 10k opening + 20k transfer - 15k groceries = 15k (now positive and solvent!)
    expect(result.accounts['wallet-cash'].endingBalance).toBe(15000);
    expect(result.accounts['wallet-cash'].floorBreached).toBe(false);
  });

  it('supports ad-hoc income and actual transactions attributed to accounts', () => {
    const settings = {
      openingBalance: 260000,
      accounts
    };

    const transactions = [
      // Freelance income credited to ICICI
      {
        id: 'tx-income',
        date: '2026-10-06',
        amount: 40000,
        isIncome: true,
        tag: 'Other',
        note: 'Freelance gig',
        accountType: 'bank',
        bankAccountId: 'bank-icici'
      },
      // Actual coffee expense from cash wallet
      {
        id: 'tx-coffee',
        date: '2026-10-07',
        amount: 3000,
        isIncome: false,
        tag: 'Food',
        note: 'Espresso with friend',
        accountType: 'wallet',
        walletId: 'wallet-cash'
      }
    ];

    const result = simulate(settings, [], { year: 2026, month: 10 }, transactions);

    // ICICI: 50k opening + 40k income = 90k
    expect(result.accounts['bank-icici'].endingBalance).toBe(90000);

    // Cash: 10k opening - 3k coffee = 7k
    expect(result.accounts['wallet-cash'].endingBalance).toBe(7000);

    // Total: 260k + 40k - 3k = 297k
    expect(result.endingBalance).toBe(297000);
  });

  describe('Funding Source Evaluation in Recommender', () => {
    it('approves purchase when designated funding account has sufficient reserves', () => {
      const settings = {
        openingBalance: 260000,
        incomeAmount: 50000,
        safetyFloor: 10000,
        currentDay: 5,
        accounts
      };

      const result = recommendPurchaseDate(
        settings,
        [],
        { year: 2026, month: 10 },
        80000, // ₹800.00 purchase
        [],
        [],
        [],
        { id: 'bank-hdfc', type: 'bank', name: 'HDFC Salary', minimumBalance: 10000 }
      );

      expect(result.feasible).toBe(true);
      expect(result.recommendedDay).toBeGreaterThanOrEqual(5);
    });

    it('rejects purchase when designated funding account has insufficient reserves despite total liquidity', () => {
      const settings = {
        openingBalance: 260000, // Aggregate is huge (260k)
        safetyFloor: 10000,
        currentDay: 5,
        accounts
      };

      // Purchase of ₹25,000 from Cash Wallet (which only holds ₹10,000)
      const result = recommendPurchaseDate(
        settings,
        [],
        { year: 2026, month: 10 },
        25000,
        [],
        [],
        [],
        { id: 'wallet-cash', type: 'wallet', name: 'Physical Cash', minimumBalance: 0 }
      );

      expect(result.feasible).toBe(false);
      expect(result.recommendedDate).toBeNull();
      expect(result.explanation).toContain('Selected funding account');
      expect(result.explanation).toContain('Physical Cash');
    });

    it('evaluates multiple goals sequentially by priority, reserving funds from funding account lowest balance', () => {
      // HDFC has 200,000 opening, 10,000 minimum balance.
      // Goal 1 (High Priority 0): ₹150,000 from HDFC.
      // Goal 2 (Low Priority 2): ₹60,000 from HDFC.
      // Remaining HDFC lowest balance after Goal 1 = 50,000.
      // Goal 2 costs 60,000, which would drop HDFC to -10,000 (breaching 10,000 minimum balance), so Goal 2 is infeasible!
      const settings = {
        openingBalance: 260000,
        safetyFloor: 15000,
        currentDay: 1,
        accounts
      };

      const goals = [
        {
          id: 'goal-gadget',
          name: 'Noise Cancelling Headphones',
          targetAmount: 60000,
          priority: 2, // Low priority
          fundingSourceType: 'bank',
          fundingBankAccountId: 'bank-hdfc',
          status: 'active'
        },
        {
          id: 'goal-laptop',
          name: 'Work Laptop',
          targetAmount: 150000,
          priority: 0, // High priority
          fundingSourceType: 'bank',
          fundingBankAccountId: 'bank-hdfc',
          status: 'active'
        }
      ];

      const evaluated = evaluateGoalsWithReservation({
        settings,
        items: [],
        month: { year: 2026, month: 10 },
        goals,
        transactions: [],
        transfers: [],
        accounts
      });

      // Goal-laptop (Priority 0) should be scheduled safely
      const laptop = evaluated.find((g) => g.id === 'goal-laptop');
      expect(laptop.recommendation.feasible).toBe(true);
      expect(laptop.recommendation.recommendedDay).toBeGreaterThanOrEqual(1);

      // Goal-gadget (Priority 2) should be rejected because HDFC lowest balance cannot absorb both
      const gadget = evaluated.find((g) => g.id === 'goal-gadget');
      expect(gadget.recommendation.feasible).toBe(false);
      expect(gadget.recommendation.recommendedDate).toBeNull();
      expect(gadget.recommendation.explanation).toContain('Selected funding account');
    });
  });

  describe('Current Balance (todayBalance) Trajectory & Object ID Unwrapping', () => {
    it('cuts down bank account todayBalance for transactions up to today, while future transactions only affect endingBalance', () => {
      const settings = {
        openingBalance: 200000,
        incomeAmount: 0,
        safetyFloor: 10000,
        currentDay: 5,
        accounts: [bankHDFC]
      };

      const transactions = [
        {
          id: 'tx-1',
          date: '2026-10-02', // Day 2 (past/today)
          amount: 30000, // ₹300.00
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        },
        {
          id: 'tx-2',
          date: '2026-10-05', // Day 5 (today)
          amount: 20000, // ₹200.00
          accountType: 'bank',
          bankAccountId: { _id: 'bank-hdfc' } // Populated ObjectId object
        },
        {
          id: 'tx-3',
          date: '2026-10-15', // Day 15 (future)
          amount: 50000, // ₹500.00
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const result = simulate(settings, [], { year: 2026, month: 10 }, transactions);
      const hdfc = result.accounts['bank-hdfc'];

      // Opening: 200,000
      // By Day 5: 200,000 - 30,000 - 20,000 = 150,000
      expect(hdfc.todayBalance).toBe(150000);

      // By End of Month: 150,000 - 50,000 = 100,000
      expect(hdfc.endingBalance).toBe(100000);
    });

    it('returns opening balance when currentDay === 0 (future month)', () => {
      const settings = {
        openingBalance: 200000,
        incomeAmount: 50000,
        salaryBankAccountId: 'bank-hdfc',
        currentDay: 0,
        accounts: [bankHDFC]
      };

      const items = [
        {
          id: 'item-bill',
          name: 'Internet',
          type: 'recurring',
          amount: 10000,
          dayOfMonth: 10,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const result = simulate(settings, items, { year: 2026, month: 11 });
      const hdfc = result.accounts['bank-hdfc'];

      expect(hdfc.todayBalance).toBe(200000);
      expect(result.todayBalance).toBe(200000);
      expect(hdfc.endingBalance).toBe(240000); // 200k + 50k income - 10k bill
    });

    it('returns ending balance when currentDay === null (past month)', () => {
      const settings = {
        openingBalance: 200000,
        incomeAmount: 0,
        currentDay: null,
        accounts: [bankHDFC]
      };

      const transactions = [
        {
          id: 'tx-past',
          date: '2026-09-20',
          amount: 45000,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const result = simulate(settings, [], { year: 2026, month: 9 }, transactions);
      const hdfc = result.accounts['bank-hdfc'];

      expect(hdfc.todayBalance).toBe(155000);
      expect(hdfc.endingBalance).toBe(155000);
    });

    it('deducts unpaid planned items from projected end but NOT current balance', () => {
      const settings = {
        openingBalance: 200000,
        incomeAmount: 0,
        currentDay: 5,
        accounts: [bankHDFC]
      };

      const items = [
        {
          id: 'item-future-unpaid',
          name: 'Future Planned Item',
          type: 'one-time',
          amount: 30000,
          day: 20,
          isPaid: false,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const result = simulate(settings, items, { year: 2026, month: 10 });
      const hdfc = result.accounts['bank-hdfc'];

      // Today is day 5: unpaid item on day 20 has not occurred yet
      expect(hdfc.todayBalance).toBe(200000);
      expect(result.todayBalance).toBe(200000);
      // But it reduces projected end balance
      expect(hdfc.endingBalance).toBe(170000);
      expect(result.endingBalance).toBe(170000);
    });

    it('deducts paid planned items immediately from bank account current balance even if scheduled later', () => {
      const settings = {
        openingBalance: 200000,
        incomeAmount: 0,
        currentDay: 5,
        accounts: [bankHDFC]
      };

      const items = [
        {
          id: 'item-future-paid',
          name: 'Pre-paid Planned Item',
          type: 'one-time',
          amount: 30000,
          day: 20,
          isPaid: true,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const result = simulate(settings, items, { year: 2026, month: 10 });
      const hdfc = result.accounts['bank-hdfc'];

      // Since isPaid is true, effective day is clamped on or before today (day 5)
      expect(hdfc.todayBalance).toBe(170000);
      expect(result.todayBalance).toBe(170000);
      expect(hdfc.endingBalance).toBe(170000);
      expect(result.endingBalance).toBe(170000);
    });

    it('shifts balance deductions cleanly when updating bank account of a planned item', () => {
      const settings = {
        openingBalance: 250000,
        incomeAmount: 0,
        currentDay: 10,
        accounts: [bankHDFC, bankICICI],
        accountOpeningBalances: [
          { accountId: 'bank-hdfc', amount: 200000 },
          { accountId: 'bank-icici', amount: 50000 }
        ]
      };

      // Item initially assigned to HDFC
      const itemsHDFC = [
        {
          id: 'item-1',
          name: 'Annual Subscription',
          type: 'one-time',
          amount: 20000,
          day: 25,
          isPaid: true,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const simHDFC = simulate(settings, itemsHDFC, { year: 2026, month: 10 });
      expect(simHDFC.accounts['bank-hdfc'].todayBalance).toBe(180000);
      expect(simHDFC.accounts['bank-hdfc'].endingBalance).toBe(180000);
      expect(simHDFC.accounts['bank-icici'].todayBalance).toBe(50000);
      expect(simHDFC.accounts['bank-icici'].endingBalance).toBe(50000);
      expect(simHDFC.todayBalance).toBe(230000);

      // Reassigned to ICICI
      const itemsICICI = [
        {
          ...itemsHDFC[0],
          bankAccountId: 'bank-icici'
        }
      ];

      const simICICI = simulate(settings, itemsICICI, { year: 2026, month: 10 });
      // HDFC balance restored
      expect(simICICI.accounts['bank-hdfc'].todayBalance).toBe(200000);
      expect(simICICI.accounts['bank-hdfc'].endingBalance).toBe(200000);
      // ICICI balance deducted
      expect(simICICI.accounts['bank-icici'].todayBalance).toBe(30000);
      expect(simICICI.accounts['bank-icici'].endingBalance).toBe(30000);
      // Unified display matches sum of accounts
      expect(simICICI.todayBalance).toBe(230000);
      expect(simICICI.endingBalance).toBe(230000);
    });

    it('aggregates scheduled salary and ad-hoc income transactions across accounts and unified metrics', () => {
      const settings = {
        openingBalance: 250000,
        incomeAmount: 100000, // ₹1,000.00 base salary credited on Day 1 to HDFC
        incomeCreditDay: 1,
        salaryBankAccountId: 'bank-hdfc',
        currentDay: 10,
        accounts: [bankHDFC, bankICICI]
      };

      const transactions = [
        // Freelance income credited to ICICI on Day 5
        {
          id: 'tx-inc-1',
          date: '2026-10-05',
          amount: 50000, // ₹500.00
          tag: 'Freelance',
          isIncome: true,
          accountType: 'bank',
          bankAccountId: 'bank-icici'
        },
        // Expense on HDFC on Day 7
        {
          id: 'tx-exp-1',
          date: '2026-10-07',
          amount: 20000, // ₹200.00
          tag: 'Food',
          isIncome: false,
          accountType: 'bank',
          bankAccountId: 'bank-hdfc'
        }
      ];

      const sim = simulate(settings, [], { year: 2026, month: 10 }, transactions);

      // Unified total income = ₹1,000 (salary) + ₹500 (freelance) = ₹1,500.00 (150,000 paise)
      expect(sim.incomeAmount).toBe(150000);

      // HDFC isolated income: ₹1,000 (salary)
      expect(sim.accounts['bank-hdfc'].incomeAmount).toBe(100000);
      // HDFC today balance: 200,000 (opening) + 100,000 (salary) - 20,000 (expense) = 280,000
      expect(sim.accounts['bank-hdfc'].todayBalance).toBe(280000);
      expect(sim.accounts['bank-hdfc'].totalExpenses).toBe(20000);

      // ICICI isolated income: ₹500 (freelance)
      expect(sim.accounts['bank-icici'].incomeAmount).toBe(50000);
      // ICICI today balance: 50,000 (opening) + 50,000 (freelance) = 100,000
      expect(sim.accounts['bank-icici'].todayBalance).toBe(100000);
      expect(sim.accounts['bank-icici'].totalExpenses).toBe(0);

      // Unified today balance = 280,000 + 100,000 = 380,000
      expect(sim.todayBalance).toBe(380000);
    });

    it('links all existing unassigned transactions under primary bank account and updates today and lowest balance accordingly', () => {
      const settings = {
        openingBalance: 260000,
        incomeAmount: 100000,
        incomeCreditDay: 1,
        salaryBankAccountId: 'bank-hdfc',
        currentDay: 10,
        accounts
      };

      const transactions = [
        // Transaction 1: Legacy transaction without any accountId or accountType
        {
          id: 'tx-legacy-1',
          date: '2026-10-03',
          amount: 25000, // ₹250.00
          tag: 'Food',
          note: 'Groceries supermarket',
          isIncome: false
        },
        // Transaction 2: Transaction explicitly marked as unassigned
        {
          id: 'tx-legacy-2',
          date: '2026-10-07',
          amount: 15000, // ₹150.00
          tag: 'Health',
          note: 'Pharmacy medicines',
          accountType: 'unassigned',
          bankAccountId: null,
          isIncome: false
        },
        // Transaction 3: Future unassigned transaction on day 20
        {
          id: 'tx-legacy-3',
          date: '2026-10-20',
          amount: 30000, // ₹300.00
          tag: 'Travel',
          isIncome: false
        },
        // Transaction 4: Transaction tagged to cash wallet (must NOT be touched)
        {
          id: 'tx-wallet',
          date: '2026-10-04',
          amount: 2000, // ₹20.00
          tag: 'Food',
          accountType: 'wallet',
          walletId: 'wallet-cash',
          isIncome: false
        }
      ];

      const sim = simulate(settings, [], { year: 2026, month: 10 }, transactions);

      // Verify Primary Bank Account (bank-hdfc) received the unassigned transactions:
      const hdfc = sim.accounts['bank-hdfc'];
      expect(hdfc).toBeDefined();

      // HDFC Opening: 200,000
      // Day 1: +100,000 salary = 300,000
      // Day 3: -25,000 (legacy-1) = 275,000
      // Day 7: -15,000 (legacy-2) = 260,000
      // Today is Day 10: todayBalance should be 260,000
      expect(hdfc.todayBalance).toBe(260000);

      // Day 20: -30,000 (legacy-3) = 230,000
      // HDFC endingBalance should be 230,000
      expect(hdfc.endingBalance).toBe(230000);

      // HDFC lowestBalance across the month: 230,000 on 2026-10-20
      expect(hdfc.lowestBalance).toBe(230000);
      expect(hdfc.lowestDate).toBe('2026-10-20');

      // HDFC total expenses: 25,000 + 15,000 + 30,000 = 70,000
      expect(hdfc.totalExpenses).toBe(70000);

      // Verify Cash Wallet was NOT affected by unassigned fallback:
      const cash = sim.accounts['wallet-cash'];
      expect(cash.openingBalance).toBe(10000);
      // 10,000 - 2,000 = 8,000
      expect(cash.todayBalance).toBe(8000);
      expect(cash.endingBalance).toBe(8000);
      expect(cash.totalExpenses).toBe(2000);

      // Verify ICICI untouched:
      const icici = sim.accounts['bank-icici'];
      expect(icici.todayBalance).toBe(50000);
      expect(icici.endingBalance).toBe(50000);

      // Unified Aggregate metrics:
      // Today balance: HDFC(260k) + ICICI(50k) + Cash(8k) = 318,000
      expect(sim.todayBalance).toBe(318000);

      // Ending balance: HDFC(230k) + ICICI(50k) + Cash(8k) = 288,000
      expect(sim.endingBalance).toBe(288000);
      expect(sim.lowestBalance).toBe(288000);
      expect(sim.lowestDate).toBe('2026-10-20');
    });
  });
});



