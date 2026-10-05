import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';

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

  it('renders Bank Accounts tab with cards, balances, and breach warning', () => {
    render(
      <AccountsScreen
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        transfers={mockTransfers}
        simulation={mockSimulation}
        currencySymbol="₹"
        onSaveBankAccount={vi.fn()}
        onSaveWallet={vi.fn()}
        onArchiveBankAccount={vi.fn()}
        onArchiveWallet={vi.fn()}
        onCreateTransfer={vi.fn()}
        onDeleteTransfer={vi.fn()}
      />
    );

    expect(screen.getByText('HDFC Salary Account')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('ICICI Savings')).toBeInTheDocument();
    expect(screen.getByText(/Projected to dip below min balance/i)).toBeInTheDocument();
  });

  it('switches to Wallets segment and displays wallet cards', () => {
    render(
      <AccountsScreen
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        transfers={mockTransfers}
        simulation={mockSimulation}
        currencySymbol="₹"
      />
    );

    const walletSegmentBtn = screen.getByRole('button', { name: /Wallets/i });
    fireEvent.click(walletSegmentBtn);

    expect(screen.getByText('Physical Cash')).toBeInTheDocument();
    expect(screen.getByText('cash Wallet')).toBeInTheDocument();
  });

  it('switches to Transfers segment and renders past paired transfers', () => {
    render(
      <AccountsScreen
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        transfers={mockTransfers}
        simulation={mockSimulation}
        currencySymbol="₹"
      />
    );

    const transfersSegmentBtn = screen.getByRole('button', { name: /Transfers/i });
    fireEvent.click(transfersSegmentBtn);

    expect(screen.getByText('HDFC Salary Account')).toBeInTheDocument();
    expect(screen.getByText('Physical Cash')).toBeInTheDocument();
    expect(screen.getByText(/ATM withdrawal/i)).toBeInTheDocument();
  });

  it('opens Transfer modal when Transfer Funds button is clicked', () => {
    render(
      <AccountsScreen
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        transfers={mockTransfers}
        simulation={mockSimulation}
        currencySymbol="₹"
      />
    );

    const transferBtn = screen.getByRole('button', { name: /Transfer Funds/i });
    fireEvent.click(transferBtn);

    expect(screen.getByText('Paired Account Transfer')).toBeInTheDocument();
    expect(screen.getByText(/Source Account/i)).toBeInTheDocument();
    expect(screen.getByText(/Destination Account/i)).toBeInTheDocument();
  });
});
