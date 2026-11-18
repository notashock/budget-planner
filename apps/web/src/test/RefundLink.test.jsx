import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { TransactionsScreen } from '../screens/TransactionsScreen.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { getPersonFunds: vi.fn(), recommendPurchaseDate: vi.fn() }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 5000000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 200000 };
const shoes = { _id: 't1', id: 't1', title: 'Running shoes', amount: 450000, date: '2026-11-12', status: 'successful', origin: 'spot', category: 'Health', accountId: 'w1' };
const tea = { _id: 't2', id: 't2', title: 'Tea', amount: 2000, date: '2026-11-15', status: 'successful', origin: 'spot', category: 'Food', accountId: 'b1' };
const salary = { _id: 't3', id: 't3', title: 'Salary', amount: 8500000, date: '2026-11-01', status: 'successful', isIncome: true, accountId: 'b1' };
const rentPlan = { _id: 'p1', id: 'p1', type: 'one-time', name: 'Rent', amount: 1500000, date: '2026-11-20', isPaid: false };

function renderEntry(props = {}) {
  return render(
    <UnifiedEntryModal
      isOpen
      onClose={vi.fn()}
      onLogTransaction={vi.fn().mockResolvedValue({})}
      onSaveItem={vi.fn()}
      bankAccounts={[bank]}
      wallets={[wallet]}
      transactions={[shoes, tea, salary]}
      plannedItems={[rentPlan]}
      month={{ year: 2026, month: 11 }}
      {...props}
    />
  );
}

const openRefund = () => fireEvent.click(screen.getByRole('button', { name: 'Expense Debit' }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getPersonFunds.mockResolvedValue({ funds: [] });
});

describe('Refunds can be linked to the spend they reverse', () => {
  it('lists recorded spends (not income or planned bills) and sends refundTargetTransactionId', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ onLogTransaction });
    openRefund();
    fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
    expect(screen.getByText('Running shoes')).toBeInTheDocument();
    expect(screen.getByText('Tea')).toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
    expect(screen.queryByText('Rent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Running shoes'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1500' } });
    expect(screen.getByTestId('link-hint')).toHaveTextContent(/net cost becomes ₹3,000\.00/);

    fireEvent.click(screen.getByRole('button', { name: /Log credit inflow/ }));
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalled());
    expect(onLogTransaction.mock.calls[0][0]).toMatchObject({
      amount: -150000,
      refundTargetTransactionId: 't1',
      plannedItemId: null,
      category: 'Health',
      accountId: 'w1',
      title: 'Refund: Running shoes'
    });
  });

  it('warns when the refund is more than was paid', () => {
    renderEntry();
    openRefund();
    fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
    fireEvent.click(screen.getByText('Tea'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } });
    expect(screen.getByTestId('link-hint')).toHaveTextContent(/More than the ₹20\.00 you paid for Tea/);
  });

  it('switching back to a spend clears the refund link (and a refund never carries a planned bill)', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ onLogTransaction });
    openRefund();
    fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
    fireEvent.click(screen.getByText('Tea'));
    fireEvent.click(screen.getByRole('button', { name: /Credit \/ Refund/ }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /Log expense debit/ }));
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalled());
    expect(onLogTransaction.mock.calls[0][0].refundTargetTransactionId).toBeUndefined();
  });

  it('an unlinked refund still saves', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ onLogTransaction });
    openRefund();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Log credit inflow/ }));
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalled());
    expect(onLogTransaction.mock.calls[0][0]).toMatchObject({ amount: -10000, plannedItemId: null });
    expect(onLogTransaction.mock.calls[0][0].refundTargetTransactionId).toBeUndefined();
  });

  it('editing a refund shows its link read-only', () => {
    const refund = { _id: 'r1', id: 'r1', origin: 'spot', status: 'successful', title: 'Shoe refund', amount: -150000, date: '2026-11-16', category: 'Health', accountId: 'w1', refundTargetTransactionId: 't1' };
    renderEntry({ initialItem: refund, initialMode: 'log' });
    expect(screen.getByTestId('refund-link-readonly')).toHaveTextContent(/Refund for Running shoes/);
    expect(screen.queryByRole('button', { name: /Refund for/ })).not.toBeInTheDocument();
  });

  it('the Transactions list says which spend a refund is for', () => {
    const refund = { _id: 'r1', id: 'r1', name: 'Shoe refund', amount: -150000, date: '2026-11-16', status: 'successful', origin: 'spot', category: 'Health', accountId: 'w1', refundTargetTransactionId: 't1' };
    render(<TransactionsScreen transactions={[shoes, refund]} bankAccounts={[bank]} wallets={[wallet]} currencySymbol="₹" onDeleteTransaction={vi.fn()} />);
    expect(screen.getByTestId('refund-for-tag')).toHaveTextContent('Refund for Running shoes');
  });
});
