import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionsScreen, groupByDay, dayLabel } from '../screens/TransactionsScreen.jsx';

// Row actions live behind each row's ⋯ menu
const openActions = (title) => fireEvent.click(screen.getByRole('button', { name: `Actions for ${title}` }));

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
    expect(screen.getByTestId('tab-transactions')).toBeInTheDocument();

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

    // Click on Planned tab
    fireEvent.click(screen.getByTestId('tab-planned'));

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
    fireEvent.click(screen.getByTestId('tab-planned'));

    // Find and click "Mark Paid" for Broadband Bill
    const markPaidButtons = screen.getAllByRole('button', { name: /Mark Paid/i });
    fireEvent.click(markPaidButtons[0]);

    // Modal opens
    expect(screen.getByText('Confirm payment')).toBeInTheDocument();

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
    fireEvent.click(screen.getByTestId('tab-planned'));

    openActions('Sony Headphones Goal');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel commitment' }));

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
    fireEvent.click(screen.getByTestId('tab-planned'));

    // Switched to planned commitments
    expect(screen.getByText('Broadband Bill')).toBeInTheDocument();
  });

  it('settles planned transaction on unified Mark as Paid with pre-filled planned values', async () => {
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

    // Switch to planned via tab
    fireEvent.click(screen.getByTestId('tab-planned'));

    // Click unified Mark as Paid button on the first planned transaction (tx-3, Cloud Storage: 80000)
    const markPaidBtns = screen.getAllByRole('button', { name: /Mark Paid/i });
    fireEvent.click(markPaidBtns[0]);

    // Modal opens pre-filled with 800 (80000 / 100)
    const confirmBtn = screen.getByRole('button', { name: /Confirm Paid/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handlePay).toHaveBeenCalledWith(
        'tx-3',
        expect.objectContaining({
          amount: 80000,
          date: expect.any(String)
        })
      );
    });
  });
  it('switches between TRANSACTIONS and PLANNED via the top-level Section Tabs', () => {
    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    const txTab = screen.getByTestId('tab-transactions');
    const plannedTab = screen.getByTestId('tab-planned');

    expect(txTab).toHaveClass('active');
    expect(screen.getByText('Coffee & Snacks')).toBeInTheDocument();

    // Click PLANNED tab
    fireEvent.click(plannedTab);
    expect(plannedTab).toHaveClass('active');
    expect(screen.getByText('Broadband Bill')).toBeInTheDocument();

    // Click TRANSACTIONS tab
    fireEvent.click(txTab);
    expect(txTab).toHaveClass('active');
    expect(screen.getByText('Coffee & Snacks')).toBeInTheDocument();
  });

  it('renders transaction card with description, bank account underneath, centered date, + / - / neutral amount formatting, and edit & delete actions', () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();

    const diverseTransactions = [
      {
        _id: 'tx-debit',
        name: 'Groceries Store',
        amount: 250000,
        date: '2026-10-18',
        status: 'successful',
        origin: 'spot',
        category: 'Food',
        accountId: 'bank-1'
      },
      {
        _id: 'tx-credit',
        name: 'Client Bonus',
        amount: 1500000,
        isIncome: true,
        date: '2026-10-19',
        status: 'successful',
        origin: 'spot',
        category: 'Income',
        accountId: 'bank-1'
      },
      {
        _id: 'tx-transfer',
        name: 'ATM Cash Withdrawal',
        amount: 500000,
        date: '2026-10-20',
        status: 'successful',
        origin: 'transfer',
        accountId: 'bank-1',
        destinationAccountId: 'wallet-1'
      }
    ];

    render(
      <TransactionsScreen
        transactions={diverseTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onEditTransaction={handleEdit}
        onDeleteTransaction={handleDelete}
      />
    );

    // 1. Descriptions
    expect(screen.getByText('Groceries Store')).toBeInTheDocument();
    expect(screen.getByText('Client Bonus')).toBeInTheDocument();
    expect(screen.getByText('ATM Cash Withdrawal')).toBeInTheDocument();

    // 2. Bank account explicitly mentioned under description
    const bankMentions = screen.getAllByText('HDFC Salary');
    expect(bankMentions.length).toBeGreaterThanOrEqual(2);

    // Transfer mentions Source -> Destination
    expect(screen.getAllByText(/HDFC Salary → Paytm Cash/).length).toBeGreaterThanOrEqual(1);

    // 3. Amount conventions:
    // Debit: -₹2,500.00
    expect(screen.getByText('-₹2,500.00')).toBeInTheDocument();
    // Credit: +₹15,000.00
    expect(screen.getByText('+₹15,000.00')).toBeInTheDocument();
    // Neutral Transfer: ₹5,000.00 (without + or -)
    expect(screen.getByText('₹5,000.00')).toBeInTheDocument();

    // 4. Edit and Delete sit in each row's ⋯ menu
    openActions('ATM Cash Withdrawal');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit transaction' }));
    expect(handleEdit).toHaveBeenCalledWith(diverseTransactions[2]);

    openActions('ATM Cash Withdrawal');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete transaction' }));
    expect(handleDelete).toHaveBeenCalledWith('tx-transfer');
  });

  it('renders planned transaction cards with description, bank account underneath, planned date, amount, Settle and Cancel actions (with Edit hidden until paid)', () => {
    const handlePay = vi.fn();
    const handleCancel = vi.fn();

    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        onPayTransaction={handlePay}
        onCancelTransaction={handleCancel}
      />
    );

    // Switch to PLANNED tab
    fireEvent.click(screen.getByTestId('tab-planned'));

    // Description
    expect(screen.getByText('Broadband Bill')).toBeInTheDocument();

    // Bank account mentioned under description
    expect(screen.getAllByText('HDFC Salary').length).toBeGreaterThanOrEqual(1);

    // Actions present on planned card: Mark Paid and Cancel (Edit is hidden until paid)
    expect(screen.getAllByRole('button', { name: /Mark Paid/i }).length).toBeGreaterThanOrEqual(1);
    openActions('Broadband Bill');
    expect(screen.getByRole('menuitem', { name: 'Cancel commitment' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Edit/i })).not.toBeInTheDocument();
  });
  it('renders the Transactions large title', () => {
    render(
      <TransactionsScreen
        transactions={mockTransactions}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    const title = screen.getByRole('heading', { level: 1, name: 'Transactions' });
    expect(title).toBeInTheDocument();
  });

  it('spots expected salary credit date without displaying a planned debit amount when amount is 0', () => {
    const salarySpotTx = [
      {
        id: 'tx-salary-spot',
        name: 'Expected Monthly Salary',
        status: 'planned',
        origin: 'salary',
        amount: 0,
        plannedAmount: 0,
        isIncome: true,
        plannedDate: '2026-11-28',
        accountId: 'bank-1'
      }
    ];

    render(
      <TransactionsScreen
        transactions={salarySpotTx}
        currencySymbol="₹"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    fireEvent.click(screen.getByTestId('tab-planned'));

    expect(screen.getByText('Expected Monthly Salary')).toBeInTheDocument();
    expect(screen.getAllByText('Sat, Nov 28').length).toBeGreaterThanOrEqual(1);
    // Does not show a planned debit amount, displays dash/spotting indicator
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('pins overdue planned items on top and groups the rest by day', () => {
    render(<TransactionsScreen transactions={mockTransactions} currencySymbol="₹" bankAccounts={mockBankAccounts} wallets={mockWallets} />);
    fireEvent.click(screen.getByTestId('tab-planned'));
    const headers = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headers[0]).toBe('Overdue');
    expect(headers.length).toBeGreaterThan(1);
  });

  it('shows the month spending shelf and opens the category breakdown', () => {
    render(
      <TransactionsScreen transactions={mockTransactions} currencySymbol="₹" bankAccounts={mockBankAccounts}
        wallets={mockWallets} month={{ year: 2026, month: 10 }} />
    );
    const shelf = screen.getByRole('button', { name: /Spending in October/ });
    expect(shelf).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(shelf);
    expect(shelf).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Spending by category')).toBeInTheDocument();
  });

  it('filters by account from the ⋯ filter menu and clears with the chip', () => {
    render(<TransactionsScreen transactions={mockTransactions} currencySymbol="₹" bankAccounts={mockBankAccounts} wallets={mockWallets} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter transactions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paytm Cash' }));
    expect(screen.queryByText('Coffee & Snacks')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Paytm Cash' }));
    expect(screen.getByText('Coffee & Snacks')).toBeInTheDocument();
  });
});

describe('groupByDay', () => {
  it('labels today and yesterday, keeps order, pins overdue first', () => {
    const list = [
      { id: 'a', date: '2026-11-23' },
      { id: 'b', date: '2026-11-22' },
      { id: 'c', date: '2026-11-22', derivedStatus: 'overdue' },
      { id: 'd', date: '2026-11-05' },
    ];
    const groups = groupByDay(list, (t) => t.date, '2026-11-23', { pinOverdue: true });
    expect(groups.map((g) => g.label)).toEqual(['Overdue', 'Today · Mon 23', 'Yesterday · Sun 22', 'Thu, Nov 5']);
    expect(groups[2].items.map((t) => t.id)).toEqual(['b']);
    expect(dayLabel('2026-11-24', '2026-11-23')).toBe('Tomorrow · Tue 24');
  });
});
