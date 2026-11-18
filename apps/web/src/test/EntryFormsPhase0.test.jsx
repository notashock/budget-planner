import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedEntryModal, INCOME_CATEGORIES, DEFAULT_INCOME_TAG } from '../components/UnifiedEntryModal.jsx';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
import { buildRemainderItem } from '../App.jsx';
import { checkFloor, findCashAccount } from '../utils/floorCheck.js';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    createPersonFund: vi.fn(),
    addPersonFundEntry: vi.fn(),
    recommendPurchaseDate: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 1000000, minimumBalance: 500000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 20000 };

describe('B1: paying less than planned can keep the rest as a pending bill', () => {
  it('builds a planned bill for the remainder on the same account', () => {
    const item = buildRemainderItem(
      { amount: 5000, name: 'Rent (remainder)', category: 'Utilities', date: '2026-11-20', accountId: 'b1' },
      { bankAccounts: [bank], wallets: [wallet] }
    );
    expect(item).toMatchObject({
      type: 'one-time', name: 'Rent (remainder)', amount: 5000, date: '2026-11-20', day: 20,
      accountType: 'bank', bankAccountId: 'b1', walletId: null, isPaid: false
    });
  });

  it('builds nothing when the bill was paid in full', () => {
    expect(buildRemainderItem(null)).toBeNull();
    expect(buildRemainderItem({ amount: 0 })).toBeNull();
  });
});

describe('B2: editing a planned item keeps its category', () => {
  it('saves the stored category, not the default', async () => {
    const onSaveItem = vi.fn().mockResolvedValue({});
    render(
      <UnifiedEntryModal
        isOpen
        onClose={vi.fn()}
        onLogTransaction={vi.fn()}
        onSaveItem={onSaveItem}
        initialMode="plan"
        initialItem={{
          _id: 'p1', id: 'p1', type: 'one-time', name: 'Electricity', amount: 250000,
          date: '2026-11-25', day: 25, category: 'Utilities', accountId: 'b1', status: 'planned'
        }}
        bankAccounts={[bank]}
        wallets={[wallet]}
        month={{ year: 2026, month: 11 }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Update Planned Item/ }));
    await waitFor(() => expect(onSaveItem).toHaveBeenCalled());
    expect(onSaveItem.mock.calls[0][0]).toMatchObject({ category: 'Utilities', tag: 'Utilities' });
  });
});

describe('B3: income opens with a category selected', () => {
  it('defaults to a category that is one of the pills (Salary stays in the salary schedule)', () => {
    expect(INCOME_CATEGORIES).toContain(DEFAULT_INCOME_TAG);
    expect(INCOME_CATEGORIES).not.toContain('Salary');
  });

  it('shows exactly one category selected when opening Income', () => {
    render(
      <UnifiedEntryModal
        isOpen
        onClose={vi.fn()}
        onLogTransaction={vi.fn()}
        onSaveItem={vi.fn()}
        initialMode="income"
        bankAccounts={[bank]}
        wallets={[wallet]}
        month={{ year: 2026, month: 11 }}
      />
    );
    const selected = screen.getAllByRole('button').filter((b) => b.classList.contains('category-pill-btn') && b.classList.contains('btn-primary'));
    expect(selected).toHaveLength(1);
  });
});

describe('B8: one safety-floor check for every outflow', () => {
  it('flags an outflow that takes an account below its floor', () => {
    expect(checkFloor(bank, 400000)).toMatchObject({ breaches: false, balanceAfter: 600000 });
    expect(checkFloor(bank, 600000)).toMatchObject({ breaches: true, balanceAfter: 400000, minimumBalance: 500000 });
  });

  it('uses the simulated balance and leaves out money held for others', () => {
    const simulation = { accounts: { b1: { todayBalance: 900000, minimumBalance: 500000, heldForOthers: 300000 } } };
    // own money = 900000 - 300000 = 600000; spending 200000 leaves 400000 < 500000
    expect(checkFloor(bank, 200000, { simulation })).toMatchObject({ breaches: true, balanceAfter: 400000 });
  });

  it('skips accounts without a floor and non-outflows', () => {
    expect(checkFloor(wallet, 50000)).toBeNull();
    expect(checkFloor(bank, 0)).toBeNull();
    expect(checkFloor(null, 100)).toBeNull();
    expect(findCashAccount('w1', [bank], [wallet])).toBe(wallet);
  });

  describe('Held & Lent', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
    });

    it('warns when lending would breach the floor and labels the button "anyway"', async () => {
      render(<HeldLentForm bankAccounts={[bank]} wallets={[wallet]} initialAction="lend" />);
      fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '6000' } });
      expect(await screen.findByTestId('floor-breach-notice')).toHaveTextContent(/Main Bank/);
      expect(screen.getByRole('button', { name: 'Lend anyway' })).toBeInTheDocument();
    });

    it('does not warn when returning money that was held (it was never yours)', async () => {
      render(<HeldLentForm bankAccounts={[bank]} wallets={[wallet]} initialAction="return" />);
      fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '6000' } });
      await waitFor(() => expect(api.getPersonFunds).toHaveBeenCalled());
      expect(screen.queryByTestId('floor-breach-notice')).not.toBeInTheDocument();
    });
  });
});
