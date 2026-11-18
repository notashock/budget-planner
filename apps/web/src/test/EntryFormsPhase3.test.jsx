import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { AppToast } from '../components/AppToast.jsx';
import { describeConsequence } from '../components/ConsequenceLine.jsx';
import { suggestCategory } from '../utils/categorySuggest.js';
import {
  rememberAccount,
  lastAccountFor,
  rememberCategory,
  rememberedCategory,
  rememberTransferPair,
  lastTransferPair
} from '../utils/entryMemory.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn().mockResolvedValue({ funds: [] }),
    recommendPurchaseDate: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 5000000, minimumBalance: 1000000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 200000 };
const card = { id: 'c1', name: 'Visa', outstanding: 100000, creditLimit: 1000000 };

const amountInput = () => screen.getByPlaceholderText('0.00');
const descriptionInput = () => screen.getByPlaceholderText(/Grocery/);
const accountTrigger = () => document.body.querySelector('.app-select-trigger');

function renderEntry(props = {}) {
  return render(
    <UnifiedEntryModal
      isOpen
      onClose={vi.fn()}
      onLogTransaction={vi.fn().mockResolvedValue({ id: 't1' })}
      onSaveItem={vi.fn().mockResolvedValue({ id: 'p1' })}
      onCreateTransfer={vi.fn().mockResolvedValue({})}
      bankAccounts={[bank]}
      wallets={[wallet]}
      creditCards={[card]}
      month={{ year: 2026, month: 11 }}
      {...props}
    />
  );
}

describe('Phase 3: quick amounts set the value', () => {
  it('tapping 500 then 1k gives 1000, not 1500', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: '500' }));
    expect(amountInput()).toHaveValue(500);
    fireEvent.click(screen.getByRole('button', { name: '1k' }));
    expect(amountInput()).toHaveValue(1000);
  });
});

describe('Phase 3: category suggestion', () => {
  it('suggests from keywords, then from what was saved before', () => {
    expect(suggestCategory('Uber to office')).toBe('Travel');
    expect(suggestCategory('Apollo pharmacy')).toBe('Health');
    expect(suggestCategory('Gift for Priya')).toBeNull();
    rememberCategory('Gift for Priya', 'Other');
    expect(suggestCategory('gift  for priya')).toBe('Other');
  });

  it('picks the category as you type until you choose one yourself', () => {
    renderEntry();
    fireEvent.change(descriptionInput(), { target: { value: 'Uber to office' } });
    expect(screen.getByRole('button', { name: 'Travel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/suggested/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    fireEvent.change(descriptionInput(), { target: { value: 'Uber to office and lunch' } });
    expect(screen.getByRole('button', { name: 'Health' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Phase 3: remembered defaults', () => {
  it('stores accounts per mode, transfer pairs and categories', () => {
    rememberAccount('log', 'wallet', 'w1');
    expect(lastAccountFor('log')).toEqual({ accountType: 'wallet', accountId: 'w1' });
    expect(lastAccountFor('income')).toBeNull();
    rememberTransferPair({ accountType: 'bank', accountId: 'b1' }, { accountType: 'wallet', accountId: 'w1' });
    expect(lastTransferPair().destination.accountId).toBe('w1');
    rememberCategory('Metro card', 'Travel');
    expect(rememberedCategory('metro card')).toBe('Travel');
  });

  it('opens Spend on the account used last time for spending', () => {
    rememberAccount('log', 'wallet', 'w1');
    renderEntry();
    expect(accountTrigger()).toHaveTextContent('Cash Wallet');
  });

  it('ignores a remembered account that no longer exists', () => {
    rememberAccount('log', 'wallet', 'gone');
    renderEntry();
    expect(accountTrigger()).toHaveTextContent('Main Bank');
  });

  it('remembers the account after saving a spend', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({ id: 't1' });
    renderEntry({ onLogTransaction, initialPreset: null });
    rememberAccount('log', 'wallet', 'w1');
    fireEvent.change(amountInput(), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Log expense debit/ }));
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalled());
    // Saved from the default (Main Bank), so that is what is remembered now
    await waitFor(() => expect(lastAccountFor('log')).toEqual({ accountType: 'bank', accountId: 'b1' }));
  });

  it('switching from Spend on a card to Income falls back to a cash account', () => {
    rememberAccount('log', 'credit_card', 'c1');
    renderEntry();
    expect(accountTrigger()).toHaveTextContent('Visa');
    fireEvent.click(screen.getByRole('button', { name: /^Income$/ }));
    expect(accountTrigger()).toHaveTextContent('Main Bank');
  });
});

describe('Phase 3: Save & add another', () => {
  it('saves, keeps the sheet open with the same account, clears the amount and counts the entry', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({ id: 't1' });
    const onClose = vi.fn();
    renderEntry({ onLogTransaction, onClose });
    fireEvent.change(amountInput(), { target: { value: '250' } });
    fireEvent.change(descriptionInput(), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & add another/ }));

    await waitFor(() => expect(onLogTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25000, title: 'Coffee', category: 'Food' }),
      { keepOpen: true }
    ));
    await waitFor(() => expect(screen.getByTestId('entry-session')).toHaveTextContent('1 added'));
    expect(amountInput()).toHaveValue(null);
    expect(descriptionInput()).toHaveValue('');
    expect(accountTrigger()).toHaveTextContent('Main Bank');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter saves and adds another', async () => {
    const onLogTransaction = vi.fn().mockResolvedValue({ id: 't1' });
    renderEntry({ onLogTransaction });
    fireEvent.change(amountInput(), { target: { value: '90' } });
    fireEvent.keyDown(amountInput(), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onLogTransaction).toHaveBeenCalledWith(expect.anything(), { keepOpen: true }));
  });

  it('is not offered when editing', () => {
    renderEntry({
      initialMode: 'log',
      initialItem: { _id: 't9', id: 't9', origin: 'spot', status: 'successful', title: 'Tea', amount: 2000, date: '2026-11-10', category: 'Food', accountId: 'b1' }
    });
    expect(screen.queryByRole('button', { name: /Save & add another/ })).not.toBeInTheDocument();
  });
});

describe('Phase 3: discard guard', () => {
  it('asks before closing a half-filled entry', () => {
    const onClose = vi.fn();
    renderEntry({ onClose });
    fireEvent.change(amountInput(), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('discard-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByTestId('discard-confirm')).not.toBeInTheDocument();
    expect(amountInput()).toHaveValue(45);
  });

  it('closes an empty entry straight away', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('discard-confirm')).not.toBeInTheDocument();
  });
});

describe('Phase 3: consequence line', () => {
  it('shows the balance after the spend and the floor margin', () => {
    renderEntry();
    fireEvent.change(amountInput(), { target: { value: '1000' } });
    const line = screen.getByTestId('consequence-line');
    expect(line).toHaveTextContent('Main Bank');
    expect(line).toHaveTextContent('above floor');
    fireEvent.change(amountInput(), { target: { value: '45000' } });
    expect(screen.getByTestId('consequence-line')).toHaveTextContent('below your floor');
    expect(screen.getByTestId('consequence-line')).toHaveClass('tone-bad');
  });

  it('describes cards by what is owed and money in by the higher balance', () => {
    expect(describeConsequence({ account: card, accountType: 'credit_card', amount: 50000, flow: 'out' }))
      .toMatchObject({ kind: 'card', owedAfter: 150000, utilisation: 0.15 });
    expect(describeConsequence({ account: wallet, accountType: 'wallet', amount: 50000, flow: 'in' }))
      .toMatchObject({ kind: 'cash', after: 250000, margin: null });
  });
});

describe('Phase 3: toast with Undo', () => {
  it('shows the message and runs Undo', async () => {
    const onUndo = vi.fn().mockResolvedValue();
    const onDismiss = vi.fn();
    render(<AppToast toast={{ id: 1, message: 'Spend saved: ₹250.00 · Coffee', onUndo }} onDismiss={onDismiss} />);
    expect(screen.getByTestId('app-toast')).toHaveTextContent('Coffee');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndo).toHaveBeenCalled());
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
  });
});
