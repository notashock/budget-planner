import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
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

describe('Held/Lent keeps what the user already typed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
  });

  it('HeldLentForm starts from carried-over values and reports edits back', async () => {
    const onValuesChange = vi.fn();
    render(
      <HeldLentForm
        bankAccounts={[bank]}
        wallets={[wallet]}
        initialValues={{ amount: '750', date: '2026-11-10', note: 'Ravi cash', accountId: 'w1' }}
        onValuesChange={onValuesChange}
      />
    );
    expect(screen.getByLabelText(/Amount/)).toHaveValue(750);
    expect(screen.getByLabelText(/Note/)).toHaveValue('Ravi cash');
    expect(screen.getByText('Cash Wallet')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '800' } });
    await waitFor(() => expect(onValuesChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: '800', date: '2026-11-10', note: 'Ravi cash', accountType: 'wallet', accountId: 'w1' })
    ));
  });

  it('ignores a carried-over account that is not a bank or wallet (e.g. a card)', () => {
    render(
      <HeldLentForm
        bankAccounts={[bank]}
        wallets={[wallet]}
        initialValues={{ amount: '100', accountId: 'card-1' }}
      />
    );
    expect(screen.getByText('Main Bank')).toBeInTheDocument();
  });

  it('switching Spending -> Held/Lent -> Spending keeps the amount and note', async () => {
    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={vi.fn()}
        onSaveItem={vi.fn()}
        bankAccounts={[bank]}
        wallets={[wallet]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1250' } });
    fireEvent.change(screen.getByPlaceholderText(/Grocery/), { target: { value: 'Ravi cash' } });

    fireEvent.click(screen.getByRole('button', { name: 'Held or Lent' }));
    expect(await screen.findByTestId('held-lent-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/)).toHaveValue(1250);
    expect(screen.getByLabelText(/Note/)).toHaveValue('Ravi cash');

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spending' }));
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(1300);
    expect(screen.getByPlaceholderText(/Grocery/)).toHaveValue('Ravi cash');
  });
});
