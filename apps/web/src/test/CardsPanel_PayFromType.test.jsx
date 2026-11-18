import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CardsPanel, resolvePayFromType } from '../components/CardsPanel.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getCards: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    confirmCardStatement: vi.fn(),
    payCardStatement: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, type: 'bank' };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', type: 'wallet' };
const walletPaidCard = {
  id: 'c1', name: 'Visa', statementDay: 20, dueDay: 8, creditLimit: 5000000, outstanding: 210000,
  unbilledSoFar: 50000, cycleEnd: '2026-12-20', cycleDueDate: '2027-01-08', payFromAccountId: 'w1', openingBalance: 0,
  openBill: { statementId: 's1', remaining: 200000, amount: 200000, dueDate: '2026-12-08', isDraft: false },
  statements: [{ id: 's1', isDraft: false }]
};

describe('resolvePayFromType', () => {
  it('returns wallet for a wallet id and bank for a bank id', () => {
    expect(resolvePayFromType('w1', [bank], [wallet])).toBe('wallet');
    expect(resolvePayFromType('b1', [bank], [wallet])).toBe('bank');
  });

  it('falls back to wallet only when there are no banks', () => {
    expect(resolvePayFromType('', [], [wallet])).toBe('wallet');
    expect(resolvePayFromType('', [bank], [wallet])).toBe('bank');
    expect(resolvePayFromType('', [], [])).toBe('bank');
  });
});

describe('CardsPanel pay-from account (wallet-paid card)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens Edit card on the wallet the bill is paid from and keeps it on save', async () => {
    api.getCards.mockResolvedValue([walletPaidCard]);
    api.updateCard.mockResolvedValue({});
    render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Visa' }));
    const form = await screen.findByTestId('card-form');
    expect(within(form).getByText('Cash Wallet')).toBeInTheDocument();
    expect(within(form).queryByText('Main Bank')).not.toBeInTheDocument();

    fireEvent.submit(form);
    await waitFor(() => expect(api.updateCard).toHaveBeenCalledWith('c1', expect.objectContaining({ payFromAccountId: 'w1' })));
  });

  it('opens Pay bill on the wallet the bill is paid from', async () => {
    api.getCards.mockResolvedValue([walletPaidCard]);
    api.payCardStatement.mockResolvedValue({});
    render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pay bill' }));
    const form = await screen.findByTestId('pay-bill-form');
    expect(within(form).getByText('Cash Wallet')).toBeInTheDocument();

    fireEvent.submit(form);
    await waitFor(() => expect(api.payCardStatement).toHaveBeenCalledWith('s1', expect.objectContaining({ fromAccountId: 'w1' })));
  });
});
