import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { GoalEditForm } from '../components/GoalEditForm.jsx';
import { TransactionsScreen } from '../screens/TransactionsScreen.jsx';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';
import { CardsPanel } from '../components/CardsPanel.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn().mockResolvedValue({ funds: [] }),
    recommendPurchaseDate: vi.fn(),
    getCards: vi.fn(),
    updateCard: vi.fn(),
    archiveCard: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 5000000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 200000 };
const spend = {
  _id: 't1', id: 't1', origin: 'spot', status: 'successful', title: 'Tea', amount: 2000,
  date: '2026-11-10', category: 'Food', accountId: 'b1'
};
const internet = {
  _id: 'p2', id: 'p2', type: 'recurring', name: 'Internet', amount: 99900, dayOfMonth: 12,
  category: 'Utilities', accountId: 'b1', status: 'planned'
};

function renderEdit(item, props = {}) {
  return render(
    <UnifiedEntryModal
      isOpen
      onClose={vi.fn()}
      onLogTransaction={vi.fn().mockResolvedValue({})}
      onSaveItem={vi.fn().mockResolvedValue({})}
      initialItem={item}
      initialMode={item?.type === 'recurring' || item?.type === 'one-time' ? 'plan' : 'log'}
      bankAccounts={[bank]}
      wallets={[wallet]}
      month={{ year: 2026, month: 11 }}
      {...props}
    />
  );
}

describe('Phase 4: what an edit changes', () => {
  it('says "No changes yet", then lists each changed field', async () => {
    renderEdit(spend);
    const summary = await screen.findByTestId('edit-summary');
    expect(summary).toHaveTextContent('No changes yet');
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '25' } });
    expect(screen.getByTestId('edit-summary')).toHaveTextContent(/Changing: Amount ₹20\.00 → ₹25\.00/);
    fireEvent.click(screen.getByRole('button', { name: 'Travel' }));
    expect(screen.getByTestId('edit-summary')).toHaveTextContent(/Category Food → Travel/);
  });

  it('asks about recurring scope only once something changed', async () => {
    renderEdit(internet);
    await screen.findByTestId('edit-summary');
    expect(screen.queryByText('This month only')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1099' } });
    expect(screen.getByText('This month only')).toBeInTheDocument();
    expect(screen.getByText('This & all future')).toBeInTheDocument();
  });
});

describe('Phase 4: delete inside the edit form', () => {
  it('confirms inline, then deletes', async () => {
    const onDeleteEntry = vi.fn().mockResolvedValue();
    renderEdit(spend, { onDeleteEntry });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirm = screen.getByTestId('delete-confirm');
    expect(confirm).toHaveTextContent(/Delete this spend\?/);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDeleteEntry).toHaveBeenCalledWith(spend));
  });

  it('Keep backs out without deleting', async () => {
    const onDeleteEntry = vi.fn();
    renderEdit(spend, { onDeleteEntry });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByTestId('delete-confirm')).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
    expect(onDeleteEntry).not.toHaveBeenCalled();
  });
});

describe('Phase 4: planning an already-paid bill', () => {
  it('a new bill has no "Payment done" toggle; the link switches to Spend', () => {
    render(
      <UnifiedEntryModal isOpen onClose={vi.fn()} onLogTransaction={vi.fn()} onSaveItem={vi.fn()}
        initialMode="plan" bankAccounts={[bank]} wallets={[wallet]} month={{ year: 2026, month: 11 }} />
    );
    expect(screen.queryByText('Payment pending')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Already paid\? Log it as spend/ }));
    expect(screen.getByRole('button', { name: /^Spending$/ })).toHaveAttribute('data-active', 'true');
  });
});

describe('Phase 4: goal edit', () => {
  const goal = { _id: 'g1', name: 'Headphones', targetAmount: 1500000, priority: 1, fundingBankAccountId: 'b1' };

  it('sends only the fields that changed', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<GoalEditForm goal={goal} bankAccounts={[bank]} wallets={[wallet]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: '14000' } });
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ targetAmount: 1400000, priority: 0 }));
  });

  it('saving with no changes just closes', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<GoalEditForm goal={goal} bankAccounts={[bank]} wallets={[wallet]} onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Phase 4: held & lent entries are changed by logging again', () => {
  const lent = {
    _id: 'h1', id: 'h1', name: 'Lent to Ravi', amount: 300000, date: '2026-11-05', status: 'successful',
    origin: 'lent_out', personFundId: 'f1', accountId: 'b1'
  };

  it('explains, then deletes and opens the form again', async () => {
    const onRelogHeldLent = vi.fn().mockResolvedValue();
    render(
      <TransactionsScreen transactions={[lent]} bankAccounts={[bank]} wallets={[wallet]} currencySymbol="₹"
        onRelogHeldLent={onRelogHeldLent} onDeleteTransaction={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change held or lent entry' }));
    const modal = await screen.findByTestId('relog-held-lent');
    expect(modal).toHaveTextContent(/can't be edited directly/);
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete and log again' }));
    await waitFor(() => expect(onRelogHeldLent).toHaveBeenCalledWith(lent));
  });

  it('the entry sheet opens on Move > A person with the same details', async () => {
    render(
      <UnifiedEntryModal isOpen onClose={vi.fn()} onLogTransaction={vi.fn()} onSaveItem={vi.fn()}
        initialMode="held"
        initialPreset={{ heldLent: { action: 'lend', fundId: 'f1', amount: 300000, date: '2026-11-05', note: 'Trip', accountId: 'w1' } }}
        bankAccounts={[bank]} wallets={[wallet]} month={{ year: 2026, month: 11 }} />
    );
    expect(await screen.findByTestId('held-lent-form')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Lend' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/Amount/)).toHaveValue(3000);
    expect(screen.getByLabelText(/Note/)).toHaveValue('Trip');
    expect(screen.getByText('Cash Wallet')).toBeInTheDocument();
  });
});

describe('Phase 4: edits that rewrite history say so', () => {
  it('editing a bank opening balance shows how much every balance shifts', () => {
    render(<AccountsScreen bankAccounts={[bank]} wallets={[wallet]} transfers={[]} simulation={null} currencySymbol="₹" />);
    fireEvent.click(screen.getAllByTitle('Edit Account')[0]);
    expect(screen.queryByTestId('opening-balance-warning')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Opening Balance/), { target: { value: '51000' } });
    expect(screen.getByTestId('opening-balance-warning')).toHaveTextContent(/Main Bank.*\+₹1,000\.00/);
  });

  describe('cards', () => {
    const visa = {
      id: 'c1', name: 'Visa', statementDay: 20, dueDay: 8, creditLimit: 5000000, outstanding: 210000,
      unbilledSoFar: 0, cycleEnd: '2026-12-20', cycleDueDate: '2027-01-08', payFromAccountId: 'b1',
      openingBalance: -100000, openBill: null, statements: []
    };
    beforeEach(() => {
      vi.clearAllMocks();
      api.getCards.mockResolvedValue([visa]);
    });

    it('warns when "Owed when added" changes', async () => {
      render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Visa' }));
      fireEvent.change(await screen.findByLabelText(/Owed when added/), { target: { value: '1500' } });
      expect(screen.getByTestId('card-owed-warning')).toHaveTextContent(/\+/);
    });

    it('removes a card after confirming', async () => {
      api.archiveCard.mockResolvedValue({});
      render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Visa' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remove card' }));
      fireEvent.click(within(screen.getByTestId('card-remove-confirm')).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(api.archiveCard).toHaveBeenCalledWith('c1'));
    });

    it('card forms have a close button', async () => {
      render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Visa' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByTestId('card-form')).not.toBeInTheDocument());
    });
  });
});
