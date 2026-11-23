import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getMonthSummary: vi.fn(),
    getPersonFunds: vi.fn().mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } }),
    getCards: vi.fn().mockResolvedValue([])
  }
}));

describe('AccountsScreen component', () => {
  const mockBankAccounts = [
    {
      _id: 'bank-1',
      name: 'HDFC Salary Account',
      institution: 'HDFC Bank',
      accountType: 'checking',
      accountNumberMasked: '1234',
      openingBalance: 5000000,
      minimumBalance: 1000000,
      isPrimary: true
    },
    {
      _id: 'bank-2',
      name: 'ICICI Savings',
      institution: 'ICICI Bank',
      accountType: 'savings',
      accountNumberMasked: '5678',
      openingBalance: 800000,
      minimumBalance: 1000000,
      isPrimary: false
    }
  ];

  const mockWallets = [
    {
      _id: 'wallet-1',
      name: 'Physical Cash',
      walletType: 'cash',
      openingBalance: 300000,
      isPrimary: true
    }
  ];

  const mockTransfers = [
    {
      _id: 'transfer-1',
      date: '2026-10-05',
      amount: 50000,
      sourceType: 'bank',
      sourceBankAccountId: { _id: 'bank-1', name: 'HDFC Salary Account' },
      destinationType: 'wallet',
      destinationWalletId: { _id: 'wallet-1', name: 'Physical Cash' },
      note: 'ATM withdrawal'
    }
  ];

  const mockSimulation = {
    accounts: {
      'bank-1': {
        todayBalance: 4950000,
        lowestBalance: 4500000,
        floorBreached: false
      },
      'bank-2': {
        todayBalance: 750000,
        lowestBalance: 700000,
        floorBreached: true
      },
      'wallet-1': {
        todayBalance: 350000,
        lowestBalance: 300000,
        floorBreached: false
      }
    }
  };

  const renderScreen = (props = {}) => render(
    <AccountsScreen
      bankAccounts={mockBankAccounts}
      wallets={mockWallets}
      transfers={mockTransfers}
      simulation={mockSimulation}
      currencySymbol="₹"
      {...props}
    />
  );

  it('lists banks and wallets as rows, with the bank-and-wallet total when no month is loaded', () => {
    renderScreen();
    const banks = within(screen.getByRole('region', { name: 'Bank accounts' }));
    expect(banks.getByText('HDFC Salary Account')).toBeInTheDocument();
    expect(banks.getByText('Primary')).toBeInTheDocument();
    expect(banks.getByText('ICICI Savings')).toBeInTheDocument();
    expect(banks.getByText('Dips below its keep-at-least')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Wallets' })).getByText('cash wallet')).toBeInTheDocument();
    expect(screen.getByText('Bank & wallets')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Wallets/i })).not.toBeInTheDocument(); // no segment tabs
    expect(api.getMonthSummary).not.toHaveBeenCalled();
  });

  it('shows the net worth the server computes, with its parts', async () => {
    api.getMonthSummary.mockResolvedValueOnce({
      netWorth: { total: 5420000, cash: 6050000, lent: 50000, cardsOwed: 580000, held: 100000 }
    });
    renderScreen({ month: { year: 2026, month: 11 } });
    expect(await screen.findByText('Net worth')).toBeInTheDocument();
    expect(screen.getByTestId('net-worth')).toHaveTextContent('₹54,200.00');
    expect(screen.getByText(/Bank & wallets ₹60,500\.00 · Lent ₹500\.00 · Cards −₹5,800\.00 · Held for others −₹1,000\.00/)).toBeInTheDocument();
    expect(api.getMonthSummary).toHaveBeenCalledWith(2026, 11);
  });

  it('opens an account page with its balance, keep-at-least, warning and recent activity', () => {
    renderScreen({
      transactions: [
        { id: 't1', name: 'Groceries', amount: 120000, date: '2026-11-03', accountId: 'bank-2', status: 'successful' },
        { id: 't2', name: 'Refund', amount: 5000, date: '2026-11-04', accountId: 'bank-2', isIncome: true, status: 'successful' },
        { id: 't3', name: 'Rent', amount: 900000, date: '2026-11-28', accountId: 'bank-2', status: 'planned' },
        { id: 't4', name: 'Coffee', amount: 15000, date: '2026-11-05', accountId: 'bank-1', status: 'successful' }
      ]
    });
    fireEvent.click(screen.getByRole('button', { name: /ICICI Savings/ }));

    const page = within(screen.getByTestId('account-page'));
    expect(page.getByRole('heading', { level: 1, name: 'ICICI Savings' })).toBeInTheDocument();
    expect(page.getByText(/Projected to dip below min balance \(₹10,000\.00\)/)).toBeInTheDocument();
    expect(page.getByText('Keep at least').nextSibling).toHaveTextContent('₹10,000.00');
    expect(page.getByText('Groceries')).toBeInTheDocument();
    expect(page.getByText('+₹50.00')).toBeInTheDocument();
    expect(page.queryByText('Rent')).not.toBeInTheDocument(); // planned, not paid yet
    expect(page.queryByText('Coffee')).not.toBeInTheDocument(); // another account

    fireEvent.click(page.getByRole('button', { name: '‹ Accounts' }));
    expect(screen.queryByTestId('account-page')).not.toBeInTheDocument();
  });

  it('account page actions: Transfer opens the Move tab from that wallet, Archive goes back to the list', () => {
    const onOpenUnifiedEntry = vi.fn();
    const onArchiveWallet = vi.fn();
    renderScreen({ onOpenUnifiedEntry, onArchiveWallet });
    fireEvent.click(screen.getByRole('button', { name: /Physical Cash/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Transfer from Wallet' }));
    expect(onOpenUnifiedEntry).toHaveBeenCalledWith('transfer', { sourceAccountId: 'wallet-1' });

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Physical Cash' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchiveWallet).toHaveBeenCalledWith('wallet-1');
    expect(screen.queryByTestId('account-page')).not.toBeInTheDocument();
  });

  it('the ＋ menu adds a bank account, wallet, card or person', async () => {
    renderScreen();
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    open();
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Bank account', 'Wallet', 'Card', 'Person']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bank account' }));
    expect(await screen.findByRole('heading', { name: 'Add Bank Account' })).toBeInTheDocument();
  });

  it('opens the add-card form from the ＋ menu', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Card' }));
    expect(await screen.findByRole('heading', { name: 'Add a credit card' })).toBeInTheDocument();
  });
});
