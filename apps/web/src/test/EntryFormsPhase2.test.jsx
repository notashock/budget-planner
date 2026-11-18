import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { SettleForm } from '../components/SettleForm.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    createPersonFund: vi.fn(),
    addPersonFundEntry: vi.fn(),
    recommendPurchaseDate: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 5000000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 200000 };
const rent = { _id: 'p1', id: 'p1', type: 'one-time', name: 'Rent', amount: 1500000, date: '2026-11-25', isPaid: false, accountId: 'b1', category: 'Utilities' };
const visa = {
  id: 'c1', name: 'Visa', outstanding: 500000,
  openBill: { statementId: 's1', remaining: 300000, minimumDue: 50000, dueDate: '2026-12-05' }
};

function renderEntry(props = {}) {
  return render(
    <UnifiedEntryModal
      isOpen
      onClose={vi.fn()}
      onLogTransaction={vi.fn()}
      onSaveItem={vi.fn()}
      onCreateTransfer={vi.fn()}
      onSettleTransaction={vi.fn()}
      bankAccounts={[bank]}
      wallets={[wallet]}
      month={{ year: 2026, month: 11 }}
      {...props}
    />
  );
}

describe('Phase 2: one settlement flow', () => {
  it('a new spend that matches a planned bill opens the Settle form and settles the bill', async () => {
    const onSettleTransaction = vi.fn().mockResolvedValue({});
    renderEntry({ plannedItems: [rent], onSettleTransaction });

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /Link & Settle/ }));

    const form = await screen.findByTestId('settle-form');
    const amount = within(form).getByLabelText(/Amount paid/);
    expect(amount).toHaveValue(15000);

    // Paid less: the leftover choice appears inline
    fireEvent.change(amount, { target: { value: '14000' } });
    fireEvent.click(within(form).getByRole('button', { name: /Still owed/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(onSettleTransaction).toHaveBeenCalled());
    const [id, payment] = onSettleTransaction.mock.calls[0];
    expect(id).toBe('p1');
    expect(payment).toMatchObject({
      amount: 1400000,
      accountId: 'b1',
      remainder: { amount: 100000, name: 'Rent (remainder)', category: 'Utilities' }
    });
  });

  it('"Log as new spend" goes back to the spend form', async () => {
    renderEntry({ plannedItems: [rent] });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /Link & Settle/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log as new spend' }));
    expect(screen.queryByTestId('settle-form')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(15000);
  });

  it('shows a server error inside the Settle form', async () => {
    const onSettleTransaction = vi.fn().mockRejectedValue(new Error('Bill already paid'));
    renderEntry({ plannedItems: [rent], onSettleTransaction });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /Link & Settle/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bill already paid');
  });

  it('SettleForm: paying the planned amount asks nothing extra; paying more says so', () => {
    const onSubmit = vi.fn();
    render(<SettleForm bill={rent} bankAccounts={[bank]} wallets={[wallet]} onSubmit={onSubmit} />);
    expect(screen.queryByTestId('settle-leftover')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Amount paid/), { target: { value: '16000' } });
    expect(screen.getByTestId('settle-over')).toHaveTextContent(/more than planned/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm paid' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 1600000, remainder: null }));
  });
});

describe('Phase 2: the Move tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
  });

  it('offers My accounts / Pay a card / A person, and Pay a card only when there are cards', () => {
    const { unmount } = renderEntry({ initialMode: 'transfer' });
    expect(screen.getByRole('button', { name: 'My accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A person' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay a card' })).not.toBeInTheDocument();
    unmount();
    renderEntry({ initialMode: 'transfer', creditCards: [visa] });
    expect(screen.getByRole('button', { name: 'Pay a card' })).toBeInTheDocument();
  });

  it('pays a card bill as a transfer into the card', async () => {
    const onCreateTransfer = vi.fn().mockResolvedValue({});
    renderEntry({ initialMode: 'transfer', creditCards: [visa], onCreateTransfer });

    fireEvent.click(screen.getByRole('button', { name: 'Pay a card' }));
    fireEvent.click(screen.getByRole('button', { name: /Bill ₹3,000/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pay Visa' }));

    await waitFor(() => expect(onCreateTransfer).toHaveBeenCalled());
    expect(onCreateTransfer.mock.calls[0][0]).toMatchObject({
      amount: 300000,
      sourceAccountId: 'b1',
      destinationAccountId: 'c1',
      destinationType: 'credit_card',
      note: 'Visa bill'
    });
  });

  it('opening "held" goes to Move > A person', async () => {
    renderEntry({ initialMode: 'held' });
    expect(await screen.findByTestId('held-lent-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('data-active', 'true');
    expect(screen.queryByRole('button', { name: 'Held or Lent' })).not.toBeInTheDocument();
  });

  it('starts from a preset source account (an account\'s own Transfer button)', () => {
    renderEntry({ initialMode: 'transfer', initialPreset: { sourceAccountId: 'w1' } });
    const triggers = document.body.querySelectorAll('.app-select-trigger');
    expect(triggers[0]).toHaveTextContent('Cash Wallet');
    expect(triggers[1]).toHaveTextContent('Main Bank');
  });
});

describe('Phase 2: no alert() in entry flows', () => {
  let alertSpy;
  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('shows a failed save inline', async () => {
    const onLogTransaction = vi.fn().mockRejectedValue(new Error('Server is down'));
    renderEntry({ onLogTransaction });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Log expense debit/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server is down');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks for an account inline when there is none selected', async () => {
    renderEntry({ initialMode: 'income', bankAccounts: [{ id: '', _id: '', name: 'Ghost' }], wallets: [] });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Income/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Choose the account/);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
