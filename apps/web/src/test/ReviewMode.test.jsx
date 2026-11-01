import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanScreen } from '../screens/PlanScreen.jsx';
import { TransactionsScreen } from '../screens/TransactionsScreen.jsx';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';
import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { Header } from '../components/Header.jsx';

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

  const activeMonth = {
    _id: 'month-active',
    id: 'month-active',
    name: 'October 2026',
    month: 10,
    year: 2026,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
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
      expect(screen.getByText(/Active Planning Cycle/i)).toBeInTheDocument();
      expect(screen.getByText(/Review Archive \(Read-Only\)/i)).toBeInTheDocument();
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
      expect(screen.getByText(/Read-Only Review/i)).toBeInTheDocument();
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
});
