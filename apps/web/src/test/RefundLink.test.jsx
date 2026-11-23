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

describe('Several refunds on one spend use what is left, not the original amount', () => {
  // Movie ticket: 1,260.24 paid, 160.00 already refunded (the production case), then a second 300.00 refund
  const movie = { _id: 'm1', id: 'm1', title: 'Movie ticket', amount: 126024, date: '2026-11-18', status: 'successful', origin: 'spot', category: 'Entertainment', accountId: 'b1' };
  const firstRefund = { _id: 'r1', id: 'r1', title: 'Ticket money', amount: -16000, date: '2026-11-19', status: 'successful', origin: 'spot', refundTargetTransactionId: 'm1', accountId: 'b1' };
  const secondRefund = { _id: 'r2', id: 'r2', title: 'Ticket money 2', amount: -30000, date: '2026-11-19', status: 'successful', origin: 'spot', refundTargetTransactionId: 'm1', accountId: 'b1' };

  const pickMovie = () => {
    openRefund();
    fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
    fireEvent.click(screen.getByText('Movie ticket'));
  };

  it('the remaining amount goes down with each linked refund', () => {
    const { unmount } = renderEntry({ transactions: [movie, firstRefund] });
    pickMovie();
    expect(screen.getByRole('button', { name: /Refund for: Movie ticket/ })).toHaveTextContent('₹1,100.24');
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    expect(screen.getByTestId('link-hint')).toHaveTextContent(/net cost becomes ₹1,000\.24/);
    unmount();

    renderEntry({ transactions: [movie, firstRefund, secondRefund] });
    pickMovie();
    expect(screen.getByRole('button', { name: /Refund for: Movie ticket/ })).toHaveTextContent('₹800.24');
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    expect(screen.getByTestId('link-hint')).toHaveTextContent(/net cost becomes ₹700\.24/);
  });

  it('refunds cannot add up to more than the spend', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ onLogTransaction, transactions: [movie, firstRefund, secondRefund] });
    pickMovie();
    // 900 fits the original 1,260.24 but not the 800.24 left
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '900' } });
    expect(screen.getByTestId('link-hint')).toHaveTextContent(/More than the ₹800\.24 left to refund on Movie ticket \(₹1,260\.24 paid\)/);
    fireEvent.click(screen.getByRole('button', { name: /Log credit inflow/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only ₹800.24 of Movie ticket is left to refund.');
    expect(onLogTransaction).not.toHaveBeenCalled();

    // Exactly what is left is fine
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '800.24' } });
    fireEvent.click(screen.getByRole('button', { name: /Log credit inflow/ }));
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalled());
    expect(onLogTransaction.mock.calls[0][0]).toMatchObject({ amount: -80024, refundTargetTransactionId: 'm1' });
  });

  it('a fully refunded spend is no longer offered', () => {
    const rest = { ...secondRefund, _id: 'r3', id: 'r3', amount: -80024 };
    renderEntry({ transactions: [movie, firstRefund, secondRefund, rest, tea] });
    openRefund();
    fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
    expect(screen.getByText('Tea')).toBeInTheDocument();
    expect(screen.queryByText('Movie ticket')).not.toBeInTheDocument();
  });

  it('editing a linked refund counts the other refunds but not itself', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ onLogTransaction, transactions: [movie, firstRefund, secondRefund], initialItem: secondRefund, initialMode: 'log' });
    expect(screen.getByTestId('refund-link-readonly')).toHaveTextContent('Refund for Movie ticket (₹1,260.24');
    // 1,100.24 is left once this refund's own 300 is set aside; 1,200 is too much
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: /credit inflow|Save|Update/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only ₹1,100.24 of Movie ticket is left to refund.');
  });
});

describe('Scrolling the link list on a phone', () => {
  it('scrolls the list without dragging or expanding the entry sheet', () => {
    const width = window.innerWidth;
    window.innerWidth = 375;
    try {
      const { container } = renderEntry();
      openRefund();
      fireEvent.click(screen.getByRole('button', { name: /Refund for/ }));
      const sheet = container.ownerDocument.querySelector('.modal-content');
      const row = screen.getByText('Running shoes');

      fireEvent.touchStart(row, { touches: [{ clientY: 400 }] });
      fireEvent.touchMove(row, { touches: [{ clientY: 330 }] }); // swipe up: would expand the sheet
      fireEvent.touchMove(row, { touches: [{ clientY: 480 }] }); // swipe down: would drag it shut
      fireEvent.touchEnd(row, { changedTouches: [{ clientY: 480 }] });
      expect(sheet).not.toHaveClass('is-expanded');
      expect(sheet.style.transform || '').not.toMatch(/80px/);

      // The handle still drags the sheet
      const handle = container.ownerDocument.querySelector('.modal-drag-zone');
      fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
      fireEvent.touchMove(handle, { touches: [{ clientY: 140 }] });
      expect(sheet.style.transform).toMatch(/40px/);
    } finally {
      window.innerWidth = width;
    }
  });
});
