import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { resolveEntryModeFromItem } from '../App.jsx';

describe('QA Incident: Editing Income Transaction opens Plan form instead of Income form', () => {
  const mockBankAccounts = [
    { _id: 'bank-1', id: 'bank-1', name: 'HDFC Salary', openingBalance: 5000000, isPrimary: true }
  ];
  const mockWallets = [
    { _id: 'wallet-1', id: 'wallet-1', name: 'Paytm Cash', openingBalance: 200000 }
  ];

  it('correctly resolves entry modes for various transaction and item types via resolveEntryModeFromItem', () => {
    expect(resolveEntryModeFromItem({ type: 'income' })).toBe('income');
    expect(resolveEntryModeFromItem({ direction: 'income' })).toBe('income');
    expect(resolveEntryModeFromItem({ isIncome: true })).toBe('income');
    expect(resolveEntryModeFromItem({ origin: 'transfer' })).toBe('transfer');
    expect(resolveEntryModeFromItem({ isTransfer: true })).toBe('transfer');
    expect(resolveEntryModeFromItem({ origin: 'spot', status: 'successful' })).toBe('log');
    expect(resolveEntryModeFromItem({ origin: 'planned', type: 'one-time' })).toBe('plan');
    expect(resolveEntryModeFromItem({ type: 'recurring' })).toBe('plan');
    expect(resolveEntryModeFromItem(null)).toBe('log');
  });

  it('FIXED: should open Income tab and pre-populate fields when initialItem is an income transaction', () => {
    const incomeTransaction = {
      _id: 'tx-inc-101',
      id: 'tx-inc-101',
      title: 'Consulting Retainer',
      name: 'Consulting Retainer',
      amount: 450000, // ₹4,500.00
      date: '2026-11-02',
      type: 'income',
      direction: 'income',
      category: 'Freelance',
      tag: 'Freelance',
      accountId: 'bank-1'
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={vi.fn()}
        onSaveItem={vi.fn()}
        initialItem={incomeTransaction}
        initialMode="income"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    // The active tab must be Income (Log Income / Direct Inflow), NOT Plan.
    const activeTab = screen.getByRole('button', { name: /^Income$/i });
    expect(activeTab).toHaveAttribute('data-active', 'true');

    // It should render the Income submission button
    const submitBtn = screen.getByRole('button', { name: /Update Income Credit|Record Income/i });
    expect(submitBtn).toBeInTheDocument();

    // The hero amount input should be pre-filled with 4500
    const amountInput = screen.getByPlaceholderText('0.00');
    expect(amountInput.value).toBe('4500');

    // The title input should be pre-filled with 'Consulting Retainer'
    const titleInput = screen.getByDisplayValue('Consulting Retainer');
    expect(titleInput).toBeInTheDocument();
  });

  it('FIXED: submits updated income payload with normalized title and name', async () => {
    const handleLogTransaction = vi.fn();
    const incomeTransaction = {
      _id: 'tx-inc-101',
      id: 'tx-inc-101',
      title: 'Consulting Retainer',
      name: 'Consulting Retainer',
      amount: 450000,
      date: '2026-11-02',
      type: 'income',
      direction: 'income',
      category: 'Freelance',
      accountId: 'bank-1'
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={handleLogTransaction}
        onSaveItem={vi.fn()}
        initialItem={incomeTransaction}
        initialMode="income"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Update Income Credit|Record Income/i });
    fireEvent.click(submitBtn);

    expect(handleLogTransaction).toHaveBeenCalledWith(expect.objectContaining({
      isIncome: true,
      amount: 450000,
      date: '2026-11-02',
      title: 'Consulting Retainer',
      name: 'Consulting Retainer',
      accountId: 'bank-1'
    }));
  });
});
