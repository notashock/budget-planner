import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanScreen } from '../screens/PlanScreen.jsx';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { CreateMonthModal, RolloverModal } from '../components/MonthModals.jsx';
import { GoalsScreen } from '../screens/GoalsScreen.jsx';

describe('Phase 5: Multi-Account Frontend Integration', () => {
  const mockMonth = {
    year: 2026,
    month: 10,
    currencySymbol: '₹',
    incomeAmount: 5000000,
    incomeCreditDay: 1,
    safetyFloor: 1000000,
    salaryBankAccountId: 'bank-1'
  };

  const mockBankAccounts = [
    {
      _id: 'bank-1',
      name: 'HDFC Salary Account',
      institution: 'HDFC',
      openingBalance: 5000000,
      minimumBalance: 1000000,
      isPrimary: true
    },
    {
      _id: 'bank-2',
      name: 'ICICI Savings',
      institution: 'ICICI',
      openingBalance: 1000000,
      minimumBalance: 500000,
      isPrimary: false
    }
  ];

  const mockWallets = [
    {
      _id: 'wallet-1',
      name: 'Cash Pocket',
      walletType: 'cash',
      openingBalance: 200000,
      isPrimary: true
    }
  ];

  const mockSimulation = {
    dailyBalances: [
      { day: 1, date: '2026-10-01', balance: 6200000 },
      { day: 2, date: '2026-10-02', balance: 6100000 }
    ],
    accountDailyBalances: {
      'bank-1': [
        { day: 1, date: '2026-10-01', balance: 5000000 },
        { day: 2, date: '2026-10-02', balance: 4900000 }
      ],
      'wallet-1': [
        { day: 1, date: '2026-10-01', balance: 200000 },
        { day: 2, date: '2026-10-02', balance: 200000 }
      ]
    },
    accounts: {
      'bank-1': { todayBalance: 4900000, endingBalance: 4500000, floorBreached: false },
      'bank-2': { todayBalance: 1000000, endingBalance: 1000000, floorBreached: false },
      'wallet-1': { todayBalance: 200000, endingBalance: 200000, floorBreached: false }
    },
    events: [
      {
        day: 2,
        amount: -100000,
        name: 'Groceries',
        bankAccountId: 'bank-1'
      }
    ],
    endingBalance: 5700000,
    todayBalance: 6100000,
    lowestBalance: 5700000,
    lowestDate: '2026-10-31',
    floorBreached: false
  };

  describe('PlanScreen Account Filter Bar', () => {
    it('renders horizontal account filter pills and filters isolated trajectory on click', () => {
      render(
        <PlanScreen
          month={mockMonth}
          items={[]}
          simulation={mockSimulation}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          onOpenUnifiedEntry={vi.fn()}
          onOpenReview={vi.fn()}
        />
      );

      expect(screen.getByText('All Accounts (Unified)')).toBeInTheDocument();
      expect(screen.getByText('HDFC Salary Account')).toBeInTheDocument();
      expect(screen.getByText('Cash Pocket')).toBeInTheDocument();

      // Click on HDFC Salary Account filter pill
      const bankPill = screen.getByText('HDFC Salary Account').closest('button');
      fireEvent.click(bankPill);

      expect(screen.getByText(/Viewing isolated trajectory for/i)).toBeInTheDocument();
      expect(screen.getByText('Reset to Unified')).toBeInTheDocument();

      // Reset back to unified
      fireEvent.click(screen.getByText('Reset to Unified'));
      expect(screen.queryByText(/Viewing isolated trajectory for/i)).not.toBeInTheDocument();
    });

    it('renders Prominent Data Transfer Banner when migrationEligible is true and opens migration on click', () => {
      const handleOpenMigration = vi.fn();
      render(
        <PlanScreen
          month={mockMonth}
          items={[]}
          simulation={mockSimulation}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          migrationEligible={true}
          onOpenMigration={handleOpenMigration}
          onOpenUnifiedEntry={vi.fn()}
          onOpenReview={vi.fn()}
        />
      );

      expect(screen.getByText(/Transfer Existing Calculations to Bank Account/i)).toBeInTheDocument();
      expect(screen.getByText(/1-Tap Ingestion/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Transfer Existing Calculations Now/i }));
      expect(handleOpenMigration).toHaveBeenCalledTimes(1);
    });

    it('calculates unified sums across all accounts and isolates safe velocity when account is selected', () => {
      const mockSimWithRichAccounts = {
        ...mockSimulation,
        safeVelocity: { rate: 5000, status: 'stable', freeSurplus: 150000, burnRate: 1000 },
        accounts: {
          'bank-1': {
            todayBalance: 4900000,
            endingBalance: 4500000,
            incomeAmount: 5000000,
            totalExpenses: 500000,
            floorBreached: false,
            safeVelocity: { rate: 3200, status: 'expanding', freeSurplus: 96000, burnRate: 800 }
          },
          'bank-2': {
            todayBalance: 1000000,
            endingBalance: 1000000,
            incomeAmount: 0,
            totalExpenses: 0,
            floorBreached: false,
            safeVelocity: { rate: 1000, status: 'stable', freeSurplus: 30000, burnRate: 0 }
          },
          'wallet-1': {
            todayBalance: 200000,
            endingBalance: 200000,
            incomeAmount: 0,
            totalExpenses: 0,
            floorBreached: false,
            safeVelocity: { rate: 800, status: 'contracting', freeSurplus: 24000, burnRate: 200 }
          }
        }
      };

      const { rerender } = render(
        <PlanScreen
          month={mockMonth}
          items={[]}
          simulation={mockSimWithRichAccounts}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          onOpenUnifiedEntry={vi.fn()}
          onOpenReview={vi.fn()}
        />
      );

      // In Unified view, Today's balance is 49000 + 10000 + 2000 = ₹61,000.00
      expect(screen.getByText('₹61,000.00')).toBeInTheDocument();

      // Click on HDFC Salary Account
      fireEvent.click(screen.getByText('HDFC Salary Account').closest('button'));

      // Isolated Today's balance for HDFC Salary Account is ₹49,000.00 (appears in filter pill and KPI card)
      expect(screen.getAllByText('₹49,000.00').length).toBeGreaterThanOrEqual(2);
      // Isolated safe velocity rate for HDFC is ₹32.00 / day
      expect(screen.getByText('₹32.00')).toBeInTheDocument();
    });
  });

  describe('UnifiedEntryModal Tri-Mode & Account Attribution', () => {
    it('renders all three mode tabs and defaults to primary bank in Log Spending', () => {
      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onLogTransaction={vi.fn()}
          onSaveItem={vi.fn()}
          onCreateTransfer={vi.fn()}
          plannedItems={[]}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          month={mockMonth}
        />
      );

      expect(screen.getByRole('button', { name: /Spending/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Plan/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Transfer/i })).toBeInTheDocument();

      // Payment Account selector exists in Log mode
      expect(screen.getByText(/Payment Account/)).toBeInTheDocument();
    });

    it('displays Bank Account Required notice and disables submit when zero accounts exist', () => {
      const mockOpenAddBank = vi.fn();
      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onLogTransaction={vi.fn()}
          onSaveItem={vi.fn()}
          onCreateTransfer={vi.fn()}
          onOpenAddBank={mockOpenAddBank}
          plannedItems={[]}
          bankAccounts={[]}
          wallets={[]}
          month={mockMonth}
        />
      );

      expect(screen.getByText(/Bank Account Required/i)).toBeInTheDocument();
      const addBankBtn = screen.getByRole('button', { name: /\+ Add Bank Account/i });
      expect(addBankBtn).toBeInTheDocument();

      const logSubmitBtn = screen.getByRole('button', { name: /Log expense debit/i });
      expect(logSubmitBtn).toBeDisabled();

      // Switch to Plan Budget Item mode
      const planTabBtn = screen.getByRole('button', { name: /Plan Budget Item/i });
      fireEvent.click(planTabBtn);

      expect(screen.getByText(/Bank Account Required/i)).toBeInTheDocument();
      const planSubmitBtn = screen.getByRole('button', { name: /Save planned item/i });
      expect(planSubmitBtn).toBeDisabled();
    });

    it('submits transaction with default primary bank account attribution', () => {
      const mockLogTx = vi.fn();
      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onLogTransaction={mockLogTx}
          onSaveItem={vi.fn()}
          onCreateTransfer={vi.fn()}
          plannedItems={[]}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          month={mockMonth}
        />
      );

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '45.50' } });

      const submitBtn = screen.getByRole('button', { name: /Log expense debit/i });
      fireEvent.click(submitBtn);

      expect(mockLogTx).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4550,
          accountType: 'bank',
          bankAccountId: 'bank-1'
        })
      );
    });

    it('auto-fills payment account when matching to a planned item with assigned wallet', () => {
      const mockLogTx = vi.fn();
      const plannedItems = [
        {
          _id: 'item-coffee',
          name: 'Morning Coffee',
          amount: 500,
          type: 'one-time',
          accountType: 'wallet',
          walletId: 'wallet-1'
        }
      ];

      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onLogTransaction={mockLogTx}
          onSaveItem={vi.fn()}
          onCreateTransfer={vi.fn()}
          plannedItems={plannedItems}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          month={mockMonth}
        />
      );

      // Open SearchableItemPicker popover and pick item
      const pickerTrigger = screen.getByRole('button', { name: /unexpected spending/i });
      fireEvent.click(pickerTrigger);
      const coffeeOption = screen.getByText('Morning Coffee');
      fireEvent.click(coffeeOption);

      // Enter amount & submit
      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '5.00' } });

      const submitBtn = screen.getByRole('button', { name: /Log expense debit/i });
      fireEvent.click(submitBtn);

      expect(mockLogTx).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          plannedItemId: 'item-coffee',
          accountType: 'wallet',
          walletId: 'wallet-1'
        })
      );
    });

    it('submits planned item with default primary bank account attribution in Plan Budget Item mode', async () => {
      const mockSaveItem = vi.fn();
      render(
        <UnifiedEntryModal
          isOpen={true}
          initialMode="plan"
          onClose={vi.fn()}
          onLogTransaction={vi.fn()}
          onSaveItem={mockSaveItem}
          onCreateTransfer={vi.fn()}
          plannedItems={[]}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          month={mockMonth}
        />
      );

      const nameInput = screen.getByPlaceholderText(/e\.g\. Rent, Electricity/i);
      fireEvent.change(nameInput, { target: { value: 'Electricity Bill' } });

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '120.00' } });

      const submitBtn = screen.getByRole('button', { name: /Save planned item/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSaveItem).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Electricity Bill',
            amount: 12000,
            accountType: 'bank',
            bankAccountId: 'bank-1'
          })
        );
      });
    });

    it('switches to Transfer mode and submits transfer payload', async () => {
      const mockCreateTransfer = vi.fn().mockResolvedValue({});
      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onLogTransaction={vi.fn()}
          onSaveItem={vi.fn()}
          onCreateTransfer={mockCreateTransfer}
          plannedItems={[]}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          month={mockMonth}
        />
      );

      const transferTabBtn = screen.getByRole('button', { name: /Transfer$/i });
      fireEvent.click(transferTabBtn);

      expect(screen.getByText(/Source Account \(Outflow\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Destination Account \(Inflow\)/i)).toBeInTheDocument();

      // Fill in amount
      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '500' } });

      const submitBtn = screen.getByRole('button', { name: /Record Transfer/i });
      fireEvent.click(submitBtn);

      expect(mockCreateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          sourceType: 'bank',
          sourceBankAccountId: 'bank-1',
          destinationType: 'wallet',
          destinationWalletId: 'wallet-1'
        })
      );
    }, 15000);
  });

  describe('CreateMonthModal & RolloverModal with Accounts', () => {
    it('renders Salary Deposit Account and composite breakdown toggle in CreateMonthModal', () => {
      render(
        <CreateMonthModal
          isOpen={true}
          onClose={vi.fn()}
          onCreate={vi.fn()}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
        />
      );

      expect(screen.getByText('Salary Deposit Account')).toBeInTheDocument();
      expect(screen.getByText('Break down by account')).toBeInTheDocument();

      // Click break down by account
      fireEvent.click(screen.getByText('Break down by account'));
      expect(screen.getByText(/Account-by-Account Opening Allocations/i)).toBeInTheDocument();
    });

    it('renders per-account carried balances in RolloverModal', () => {
      render(
        <RolloverModal
          isOpen={true}
          currentMonth={mockMonth}
          endingBalance={5700000}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          simulation={{
            accounts: {
              'bank-1': { endingBalance: 5700000 },
              'wallet-1': { endingBalance: 150000 }
            }
          }}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Per-Account Ending Balances Carried:/i)).toBeInTheDocument();
      expect(screen.getByText('HDFC Salary Account')).toBeInTheDocument();
      expect(screen.getByText('Cash Pocket')).toBeInTheDocument();
    });

    it('renders embedded Primary Bank Account setup when user has 0 bank accounts and submits atomically', () => {
      const handleCreate = vi.fn();
      render(
        <CreateMonthModal
          isOpen={true}
          onClose={vi.fn()}
          onCreate={handleCreate}
          bankAccounts={[]}
          wallets={[]}
        />
      );

      expect(screen.getByText(/Primary Bank Account Setup/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e\.g\. Primary Checking, Salary Account/i)).toBeInTheDocument();

      // Enter institution and opening balance
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. HDFC Bank, Chase/i), {
        target: { value: 'State Bank of India' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '25000' }
      });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /Create month/i }));

      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          openingBalance: 2500000,
          newBankAccount: expect.objectContaining({
            name: 'Primary Checking',
            institution: 'State Bank of India',
            accountType: 'checking',
            openingBalance: 2500000,
            isPrimary: true,
            isSalaryDeposit: true
          })
        })
      );
    });

    it('renders funding account selector in GoalsScreen and includes account details in goal submission', () => {
      const handleCreateGoal = vi.fn();
      render(
        <GoalsScreen
          month={mockMonth}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          onCreateGoal={handleCreateGoal}
        />
      );

      expect(screen.getByText(/Funding Account \*/i)).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText(/e\.g\. Noise Cancelling Headphones, Laptop/i), {
        target: { value: 'MacBook Pro M3' }
      });
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '1800' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Set purchase goal/i }));

      expect(handleCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'MacBook Pro M3',
          targetAmount: 180000,
          fundingSourceType: 'bank',
          fundingBankAccountId: 'bank-1'
        })
      );
    });
  });

  describe('Multi-Stream Income Logging and Precise Account Aggregation', () => {
    it('renders Log Income tab in UnifiedEntryModal and submits direct income with account attribution', async () => {
      const handleLogTransaction = vi.fn();

      render(
        <UnifiedEntryModal
          isOpen={true}
          onClose={vi.fn()}
          month={mockMonth}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          onLogTransaction={handleLogTransaction}
          onSaveItem={vi.fn()}
        />
      );

      // Verify Income tab is present and click it
      const incomeTabBtn = screen.getByRole('button', { name: /Income/i });
      expect(incomeTabBtn).toBeInTheDocument();
      fireEvent.click(incomeTabBtn);

      // Verify scheduled salary card is displayed
      expect(screen.getByText(/Scheduled Monthly Salary/i)).toBeInTheDocument();
      expect(screen.getAllByText(/HDFC Salary Account/i).length).toBeGreaterThanOrEqual(1);

      // Fill in income form
      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '25000' } });

      // Click Freelance source pill
      const freelanceBtn = screen.getByRole('button', { name: 'Freelance' });
      fireEvent.click(freelanceBtn);

      // Submit income
      const submitBtn = screen.getByRole('button', { name: /Record Income/i });
      fireEvent.click(submitBtn);

      expect(handleLogTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2500000,
          isIncome: true,
          tag: 'Freelance',
          accountType: 'bank',
          bankAccountId: 'bank-1'
        })
      );
    });

    it('displays aggregate KPIs on PlanScreen in Unified view and isolated metrics on account select', () => {
      const simWithIncome = {
        ...mockSimulation,
        incomeAmount: 7500000, // 50,000 scheduled + 25,000 freelance
        totalExpenses: 100000,
        todayBalance: 8600000,
        lowestBalance: 8500000,
        accounts: {
          'bank-1': {
            incomeAmount: 7500000,
            totalExpenses: 100000,
            todayBalance: 7400000,
            lowestBalance: 7400000,
            endingBalance: 7400000,
            floorBreached: false
          },
          'bank-2': {
            incomeAmount: 0,
            totalExpenses: 0,
            todayBalance: 1000000,
            lowestBalance: 1000000,
            endingBalance: 1000000,
            floorBreached: false
          },
          'wallet-1': {
            incomeAmount: 0,
            totalExpenses: 0,
            todayBalance: 200000,
            lowestBalance: 200000,
            endingBalance: 200000,
            floorBreached: false
          }
        }
      };

      const { rerender } = render(
        <PlanScreen
          month={mockMonth}
          items={[]}
          simulation={simWithIncome}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          onOpenUnifiedEntry={vi.fn()}
          onOpenReview={vi.fn()}
        />
      );

      // In Unified view, Monthly Income displays 75,000 (simulation.incomeAmount)
      expect(screen.getByText('₹75,000.00')).toBeInTheDocument();

      // Click on ICICI Savings (bank-2)
      fireEvent.click(screen.getByText('ICICI Savings'));

      // In bank-2 isolated view, income is ₹0.00 and today's balance is ₹10,000.00
      expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1);
    });
  });
});
