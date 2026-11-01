import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionsScreen } from '../screens/TransactionsScreen.jsx';

describe('TransactionsScreen', () => {
  const mockBankAccounts = [
    { _id: 'bank-1', name: 'HDFC Salary', openingBalance: 5000000 }
  ];
  const mockWallets = [
    { _id: 'wallet-1', name: 'Paytm Cash', openingBalance: 200000 }
  ];

  const mockTransactions = [
    {
      _id: 'tx-1',
      name: 'Coffee & Snacks',
      amount: 45000,
      date: '2026-10-15',
      status: 'successful',
      origin: 'spot',
      category: 'Food',
      accountId: 'bank-1'
    },
    {
      _id: 'tx-2',
      name: 'Broadband Bill',
      amount: 150000,
      plannedAmount: 150000,
      plannedDate: '2026-10-21',
      status: 'planned',
      derivedStatus: 'due',
      origin: 'planned',
      category: 'Bills',
      accountId: 'bank-1'
    },
    {
      _id: 'tx-3',
      name: 'Cloud Storage',
      amount: 80000,
      plannedAmount: 80000,
      plannedDate: '2026-10-10',
      status: 'planned',
      derivedStatus: 'overdue',
      origin: 'planned',
      category: 'Tech',
      accountId: 'bank-1'
    },
    {
      _id: 'tx-4',
      name: 'Sony Headphones Goal',
      amount: 2500000,
      plannedAmount: 2500000,
      plannedDate: '2026-10-25',
      status: 'planned',
      derivedStatus: 'planned',
      origin: 'goal',
      goalId: 'goal-99',
      category: 'Gadgets',
      accountId: 'bank-1'
    }
  ];

  it('renders filter & sort controls and displays successful transactions by default', () => {
    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onOpenUnifiedEntry={vi.fn()}
        onEditTransaction={vi.fn()}
        onPayTransaction={vi.fn()}
        onCancelTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />
    );

    // Filter & Sort trigger exists
    expect(screen.getByRole('button', { name: /Filter and Sort/i })).toBeInTheDocument();

    // Default view shows successful transaction
    expect(screen.getByText('Coffee & Snacks')).toBeInTheDocument();
  });

  it('switches to planned commitments view and displays due & overdue badges', () => {
    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onOpenUnifiedEntry={vi.fn()}
        onEditTransaction={vi.fn()}
        onPayTransaction={vi.fn()}
        onCancelTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />
    );

    // Open Filter & Sort dropdown
    fireEvent.click(screen.getByRole('button', { name: /Filter and Sort/i }));

    // Click on Planned Commitments segment
    fireEvent.click(screen.getByRole('menuitem', { name: /Planned Commitments/i }));

    // Now planned transactions are visible
    expect(screen.getByText('Broadband Bill')).toBeInTheDocument();
    expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
    expect(screen.getByText('Sony Headphones Goal')).toBeInTheDocument();

    // Badges exist
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
  });

  it('opens confirmation modal and settles transaction on one-tap Mark as Paid', async () => {
    const handlePay = vi.fn().mockResolvedValue({});

    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onOpenUnifiedEntry={vi.fn()}
        onEditTransaction={vi.fn()}
        onPayTransaction={handlePay}
        onCancelTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />
    );

    // Open Filter & Sort dropdown and switch to planned
    fireEvent.click(screen.getByRole('button', { name: /Filter and Sort/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Planned Commitments/i }));

    // Find and click "Mark Paid" for Broadband Bill
    const markPaidButtons = screen.getAllByRole('button', { name: /Mark Paid/i });
    fireEvent.click(markPaidButtons[0]);

    // Modal opens
    expect(screen.getByText('Confirm Payment Settlement')).toBeInTheDocument();

    // Submit payment
    const confirmBtn = screen.getByRole('button', { name: /Confirm Paid/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handlePay).toHaveBeenCalledWith(
        'tx-3',
        expect.objectContaining({
          amount: 80000,
          date: expect.any(String),
          accountId: 'bank-1'
        })
      );
    });
  });

  it('prompts user with return-to-logged vs mark-dropped when cancelling a goal transaction', async () => {
    const handleCancel = vi.fn().mockResolvedValue({});

    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onOpenUnifiedEntry={vi.fn()}
        onEditTransaction={vi.fn()}
        onPayTransaction={vi.fn()}
        onCancelTransaction={handleCancel}
        onDeleteTransaction={vi.fn()}
      />
    );

    // Open Filter & Sort dropdown and switch to planned
    fireEvent.click(screen.getByRole('button', { name: /Filter and Sort/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Planned Commitments/i }));

    // Click cancel button on goal transaction
    const cancelButtons = screen.getAllByTitle('Cancel planned transaction');
    // The goal transaction is the last one
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    // Goal cancellation prompt opens
    expect(screen.getByText('Cancel Scheduled Goal')).toBeInTheDocument();
    expect(screen.getByText(/Return to Logged/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark as Dropped/i)).toBeInTheDocument();

    // Confirm cancel with default "return_to_logged" action
    const returnToLoggedBtn = screen.getByRole('button', { name: /Return to Logged/i });
    fireEvent.click(returnToLoggedBtn);

    await waitFor(() => {
      expect(handleCancel).toHaveBeenCalledWith('tx-4', { goalAction: 'return_to_logged' });
    });
  });

  it('switches view mode via Filter & Sort dropdown menu', () => {
    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    // Initial state: Coffee & Snacks (successful) is visible
    expect(screen.getByText('Coffee & Snacks')).toBeInTheDocument();

    // Open dropdown and switch
    fireEvent.click(screen.getByRole('button', { name: /Filter and Sort/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Planned Commitments/i }));

    // Switched to planned commitments
    expect(screen.getByText('Broadband Bill')).toBeInTheDocument();
  });

  it('settles planned transaction immediately on one-tap Quick Pay without opening modal', async () => {
    const handlePay = vi.fn().mockResolvedValue({});

    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onPayTransaction={handlePay}
      />
    );

    // Switch to planned via dropdown
    fireEvent.click(screen.getByRole('button', { name: /Filter and Sort/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Planned Commitments/i }));

    // Click Quick Pay button on the first planned transaction (tx-3, Cloud Storage: 80000)
    const quickPayBtns = screen.getAllByRole('button', { name: /Quick Pay/i });
    fireEvent.click(quickPayBtns[0]);

    await waitFor(() => {
      expect(handlePay).toHaveBeenCalledWith(
        'tx-3',
        expect.objectContaining({
          amount: 80000,
          date: expect.any(String)
        })
      );
    });

    // The manual settlement modal should NOT be open
    expect(screen.queryByText('Confirm Payment Settlement')).not.toBeInTheDocument();
  });
});

