import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanScreen } from '../screens/PlanScreen.jsx';
import { TransactionsScreen } from '../screens/TransactionsScreen.jsx';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';
import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { Header } from '../components/Header.jsx';
import { BottomNav } from '../components/BottomNav.jsx';
import { MonthRolloverModal } from '../components/MonthRolloverModal.jsx';

describe('Continuous Tracking & Read-Only Review Mode', () => {
  const closedMonth = {
    _id: 'month-closed',
    id: 'month-closed',
    name: 'September 2026',
    month: 9,
    year: 2026,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    isClosed: true,
    closedAt: '2026-10-01T10:00:00.000Z',
    closingBalances: {
      'bank-1': {
        openingBalance: 5000000,
        totalInflow: 20000000,
        totalOutflow: 12000000,
        closingBalance: 13000000
      },
      'wallet-1': {
        openingBalance: 50000,
        totalInflow: 100000,
        totalOutflow: 80000,
        closingBalance: 70000
      }
    }
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const lastDay = new Date(currentYear, currentMonthNum, 0).getDate();

  const activeMonth = {
    _id: 'month-active',
    id: 'month-active',
    name: `${currentMonthNum === 11 ? 'November' : 'Current'} ${currentYear}`,
    month: currentMonthNum,
    year: currentYear,
    startDate: `${currentYear}-${String(currentMonthNum).padStart(2, '0')}-01`,
    endDate: `${currentYear}-${String(currentMonthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    isClosed: false
  };

  const mockBankAccounts = [
    {
      _id: 'bank-1',
      id: 'bank-1',
      name: 'HDFC Salary Account',
      institution: 'HDFC Bank',
      accountType: 'checking',
      openingBalance: 5000000,
      minimumBalance: 1000000,
      isPrimary: true
    }
  ];

  const mockWallets = [
    {
      _id: 'wallet-1',
      id: 'wallet-1',
      name: 'Physical Cash',
      walletType: 'cash',
      openingBalance: 50000,
      isPrimary: true
    }
  ];

  const mockTransfers = [
    {
      _id: 'tr-1',
      id: 'tr-1',
      date: '2026-09-15',
      amount: 50000,
      sourceType: 'bank',
      sourceBankAccountId: 'bank-1',
      destinationType: 'wallet',
      destinationWalletId: 'wallet-1',
      note: 'ATM'
    }
  ];

  describe('Header Navigation & Modal Ceremonies', () => {
    it('does not render Create Month or Rollover buttons and categorizes closed months in dropdown', () => {
      render(
        <Header
          currentMonth={closedMonth}
          months={[closedMonth, activeMonth]}
          activePlanningMonth={activeMonth}
          isReviewMode={true}
          onSelectMonth={vi.fn()}
        />
      );

      // Verify create/rollover ceremonies are retired
      expect(screen.queryByText(/Create new month/i)).toBeNull();
      expect(screen.queryByText(/Rollover/i)).toBeNull();

      // Open month picker dropdown
      const trigger = screen.getByRole('button', { name: /Select month/i });
      fireEvent.click(trigger);

      // Check dropdown category labels
      expect(screen.getByText(/^Active Planning Cycle$/i)).toBeInTheDocument();
      expect(screen.getByText(/Previous Month Previews \(Read-Only\)/i)).toBeInTheDocument();
    });

    it('does not render future months in the dropdown', () => {
      const futureMonth = {
        _id: 'month-future',
        id: 'month-future',
        name: 'December 2026',
        month: 12,
        year: 2026,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        isClosed: false
      };

      render(
        <Header
          currentMonth={activeMonth}
          months={[closedMonth, activeMonth, futureMonth]}
          activePlanningMonth={activeMonth}
          isReviewMode={false}
          onSelectMonth={vi.fn()}
        />
      );

      const trigger = screen.getByRole('button', { name: /Select month/i });
      fireEvent.click(trigger);

      // Future month should not be in the dropdown
      expect(screen.queryByText(/December 2026/i)).toBeNull();
      // Active current month should be present
      expect(screen.getAllByText(new RegExp(`${activeMonth.name}`, 'i')).length).toBeGreaterThan(0);
    });
  });

  describe('PlanScreen in Review Mode', () => {
    it('hides entry creation button and renders review archive badge', () => {
      render(
        <PlanScreen
          month={closedMonth}
          items={[]}
          transactions={[]}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          isReviewMode={true}
          onOpenUnifiedEntry={vi.fn()}
        />
      );

      expect(screen.queryByText(/\+ New Entry/i)).toBeNull();
      expect(screen.getByText(/Historical Preview/i)).toBeInTheDocument();
    });
  });

  describe('TransactionsScreen in Review Mode', () => {
    const mockTx = [
      {
        _id: 'tx-1',
        id: 'tx-1',
        title: 'Groceries',
        amount: 25000,
        paidDate: '2026-09-10',
        paymentStatus: 'paid',
        paymentSourceType: 'bank',
        paymentBankAccountId: 'bank-1'
      }
    ];

    it('hides action buttons and delete button on transactions', () => {
      const onDelete = vi.fn();
      render(
        <TransactionsScreen
          month={closedMonth}
          items={[]}
          transactions={mockTx}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          isReviewMode={true}
          onOpenUnifiedEntry={vi.fn()}
          onDeleteTransaction={onDelete}
        />
      );

      expect(screen.queryByText(/Plan Ahead/i)).toBeNull();
      expect(screen.queryByText(/Log Spend/i)).toBeNull();
      expect(screen.getByText(/Read-Only Review/i)).toBeInTheDocument();
      expect(screen.queryByTitle(/Delete Transaction/i)).toBeNull();
    });
  });

  describe('AccountsScreen in Review Mode', () => {
    it('displays snapshotted closing balance breakdown and hides mutation controls', () => {
      render(
        <AccountsScreen
          month={closedMonth}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          transfers={mockTransfers}
          isReviewMode={true}
          onOpenTransferModal={vi.fn()}
          onOpenAddBankModal={vi.fn()}
          onOpenAddWalletModal={vi.fn()}
        />
      );

      // Verify mutation buttons are hidden
      expect(screen.queryByRole('button', { name: /Transfer Funds/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Add Bank/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Transfer from Account/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Transfer from Wallet/i })).toBeNull();
      expect(screen.queryByTitle(/Edit Account/i)).toBeNull();
      expect(screen.queryByTitle(/Archive Account/i)).toBeNull();

      // Verify snapshotted breakdown
      expect(screen.getByText(/Snapshotted Closing Balances/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Closing Balance \(Snapshotted\)/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Total Inflow/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Outflow/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Movement/i)).toBeInTheDocument();
    });

    it('hides transfer delete button in transfers segment in review mode', () => {
      render(
        <AccountsScreen
          month={closedMonth}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          transfers={mockTransfers}
          isReviewMode={true}
        />
      );

      // Switch to transfers segment
      const transfersTab = screen.getByRole('button', { name: /Transfers/i });
      fireEvent.click(transfersTab);

      expect(screen.queryByTitle(/Delete Transfer/i)).toBeNull();
    });
  });

  describe('GoalsScreen in Review Mode', () => {
    const mockGoals = [
      {
        _id: 'goal-1',
        name: 'Headphones',
        targetAmount: 1500000,
        status: 'ready',
        priority: 0
      }
    ];

    it('replaces goal input form with Goal Scorecard and hides card action buttons', () => {
      render(
        <GoalsScreen
          month={closedMonth}
          goals={mockGoals}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          isReviewMode={true}
          onCreateGoal={vi.fn()}
          onDeleteGoal={vi.fn()}
        />
      );

      expect(screen.queryByText(/Set Target Purchase/i)).toBeNull();
      expect(screen.getByText(/Goal Scorecard \(Archive\)/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Schedule/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull();
    });
  });

  describe('Month Advancement Recovery & Rollover Modal', () => {
    it('renders start month action in header dropdown when no active planning cycle exists', () => {
      const onOpenRollover = vi.fn();
      render(
        <Header
          currentMonth={closedMonth}
          months={[closedMonth]} // Only closed month, activePlanningMonths.length === 0
          hasActivePlanningMonth={false}
          isReviewMode={true}
          onOpenRollover={onOpenRollover}
          nextMonthLabel="October 2026"
          onSelectMonth={vi.fn()}
        />
      );

      // Open month picker dropdown
      const trigger = screen.getByRole('button', { name: /Select month/i });
      fireEvent.click(trigger);

      // Verify Start Month button is present in dropdown
      const startBtn = screen.getByTestId('header-start-month-btn');
      expect(startBtn).toBeInTheDocument();
      expect(startBtn).toHaveTextContent(/Start October 2026/i);

      fireEvent.click(startBtn);
      expect(onOpenRollover).toHaveBeenCalledTimes(1);
    });

    it('renders floating recovery pill in BottomNav when in review mode with no active planning month', () => {
      const onOpenRollover = vi.fn();
      render(
        <BottomNav
          activeTab="plan"
          onSelectTab={vi.fn()}
          isReviewMode={true}
          hasActivePlanningMonth={false}
          onOpenRollover={onOpenRollover}
          nextMonthLabel="October 2026"
        />
      );

      const pill = screen.getByTestId('bottom-nav-rollover-btn');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent(/Start October 2026/i);

      fireEvent.click(pill);
      expect(onOpenRollover).toHaveBeenCalledTimes(1);
    });

    it('renders MonthRolloverModal with snapshotted closing balances and confirms rollover', async () => {
      const onConfirm = vi.fn().mockResolvedValue({});
      const onClose = vi.fn();

      render(
        <MonthRolloverModal
          isOpen={true}
          month={closedMonth}
          bankAccounts={mockBankAccounts}
          wallets={mockWallets}
          currencySymbol="₹"
          onClose={onClose}
          onConfirmRollover={onConfirm}
        />
      );

      // Check modal heading and closing balances
      expect(screen.getByRole('heading', { name: /Start October 2026/i })).toBeInTheDocument();
      expect(screen.getByText(/HDFC Salary Account/i)).toBeInTheDocument();
      expect(screen.getByText(/Physical Cash/i)).toBeInTheDocument();

      // Check default checkboxes
      const unpaidCheckbox = screen.getByTestId('rollover-unpaid-checkbox');
      const carryCheckbox = screen.getByTestId('carry-balance-checkbox');
      expect(unpaidCheckbox).toBeChecked();
      expect(carryCheckbox).toBeChecked();

      // Click confirm button
      const confirmBtn = screen.getByTestId('confirm-rollover-btn');
      fireEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledWith(true, true);
    });

    it('prevents future months (such as December 2026) from being marked Current or active planning cycle', () => {
      const novMonth = {
        _id: 'nov-2026',
        id: 'nov-2026',
        name: 'November 2026',
        month: 11,
        year: 2026,
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        isClosed: false
      };

      const decMonth = {
        _id: 'dec-2026',
        id: 'dec-2026',
        name: 'December 2026',
        month: 12,
        year: 2026,
        startDate: '2026-11-09',
        endDate: '2026-12-31',
        isClosed: false
      };

      render(
        <Header
          currentMonth={novMonth}
          months={[decMonth, novMonth, closedMonth]}
          onSelectMonth={vi.fn()}
          onOpenRollover={vi.fn()}
        />
      );

      // Open dropdown
      const trigger = screen.getByRole('button', { name: /Select month/i });
      fireEvent.click(trigger);

      // December 2026 must NOT have the Current badge
      const decItem = screen.queryByText(/December 2026/i);
      if (decItem) {
        // If rendered at all, it must NOT be in active planning cycle
        const activeSection = screen.getByText(/^Active Planning Cycle$/i).parentElement;
        expect(activeSection).not.toHaveTextContent(/December 2026/i);
      }
    });
  });
});
