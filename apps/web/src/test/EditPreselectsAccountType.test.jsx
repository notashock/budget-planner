import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';

// Editing an entry must open with the account it was paid from selected,
// whether that is a bank account, a wallet or a credit card.
describe('Editing an entry preselects its account', () => {
  const bankAccounts = [{ _id: 'bank-1', id: 'bank-1', name: 'HDFC Salary', openingBalance: 5000000, isPrimary: true }];
  const wallets = [{ _id: 'wallet-1', id: 'wallet-1', name: 'Paytm Cash', openingBalance: 200000 }];
  const creditCards = [{ _id: 'card-1', id: 'card-1', name: 'Regalia Card', type: 'credit_card', creditLimit: 10000000, outstanding: 0 }];

  const openEdit = (accountId, accountType) => render(
    <UnifiedEntryModal
      isOpen={true}
      onClose={vi.fn()}
      onLogTransaction={vi.fn()}
      onSaveItem={vi.fn()}
      initialItem={{
        _id: 'tx-1', id: 'tx-1', title: 'Spend', amount: 50000, date: '2026-11-02',
        origin: 'spot', direction: 'expense', status: 'successful', category: 'Food',
        accountId, bankAccountId: accountId, accountType
      }}
      initialMode="log"
      bankAccounts={bankAccounts}
      wallets={wallets}
      creditCards={creditCards}
    />
  );

  it.each([
    ['bank', 'bank-1', 'HDFC Salary'],
    ['wallet', 'wallet-1', 'Paytm Cash'],
    ['credit_card', 'card-1', 'Regalia Card']
  ])('%s spend opens with that account selected', (accountType, accountId, name) => {
    openEdit(accountId, accountType);
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    const others = ['HDFC Salary', 'Paytm Cash', 'Regalia Card'].filter((n) => n !== name);
    for (const other of others) expect(screen.queryByText(other)).toBeNull();
  });
});
