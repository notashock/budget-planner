import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
import { CardsPanel } from '../components/CardsPanel.jsx';
import { findBillMatch, detectDuplicateSalary, detectPersonHint } from '../utils/entryAssists.js';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    createPersonFund: vi.fn(),
    addPersonFundEntry: vi.fn(),
    recommendPurchaseDate: vi.fn(),
    getCards: vi.fn(),
    confirmCardStatement: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main Bank', isPrimary: true, openingBalance: 5000000 };
const wallet = { id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 200000 };
const rent = { _id: 'p1', id: 'p1', type: 'one-time', name: 'Rent', amount: 1500000, date: '2026-11-20', isPaid: false };
const gym = { _id: 'p3', id: 'p3', type: 'one-time', name: 'Gym membership', amount: 250000, date: '2026-11-19', isPaid: false };
const later = { _id: 'p4', id: 'p4', type: 'one-time', name: 'Insurance', amount: 1500000, date: '2026-12-30', isPaid: false };
const month = { year: 2026, month: 11, incomeAmount: 8500000, incomeCreditDate: '2026-11-30' };

function renderEntry(props = {}) {
  return render(
    <UnifiedEntryModal
      isOpen
      onClose={vi.fn()}
      onLogTransaction={vi.fn().mockResolvedValue({})}
      onSaveItem={vi.fn()}
      onSettleTransaction={vi.fn()}
      bankAccounts={[bank]}
      wallets={[wallet]}
      month={month}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getPersonFunds.mockResolvedValue({ funds: [] });
});

describe('Phase 5: finding the bill a spend pays', () => {
  const opts = { today: '2026-11-18', year: 2026, month: 11 };

  it('matches within 10% of the planned amount', () => {
    expect(findBillMatch([rent], { ...opts, amount: 1400000 })?.item).toBe(rent);
    expect(findBillMatch([rent], { ...opts, amount: 1300000 })).toBeNull();
  });

  it('matches on a word of the bill name', () => {
    expect(findBillMatch([rent, gym], { ...opts, description: 'gym fees', amount: 99900 })?.item).toBe(gym);
  });

  it('ignores paid bills and bills due more than a week out; overdue still counts', () => {
    expect(findBillMatch([{ ...rent, isPaid: true }], { ...opts, amount: 1500000 })).toBeNull();
    expect(findBillMatch([later], { ...opts, amount: 1500000 })).toBeNull();
    expect(findBillMatch([{ ...rent, date: '2026-11-02' }], { ...opts, amount: 1500000 })?.item.id).toBe('p1');
  });

  it('asks "Paying Rent?" in the entry sheet, and No dismisses it', () => {
    renderEntry({ plannedItems: [rent] });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '14500' } });
    expect(screen.getByTestId('assist-bill')).toHaveTextContent(/Paying Rent/);
    fireEvent.click(within(screen.getByTestId('assist-bill')).getByRole('button', { name: 'No' }));
    expect(screen.queryByTestId('assist-bill')).not.toBeInTheDocument();
  });
});

describe('Phase 5: duplicate salary guard', () => {
  it('spots salary by wording or by the scheduled amount', () => {
    expect(detectDuplicateSalary({ description: 'November salary', amount: 100, month })).toMatchObject({ amount: 8500000 });
    expect(detectDuplicateSalary({ description: 'Bonus', amount: 8400000, month })).not.toBeNull();
    expect(detectDuplicateSalary({ description: 'Freelance', amount: 500000, month })).toBeNull();
    expect(detectDuplicateSalary({ description: 'salary', amount: 0, month: {} })).toBeNull();
  });

  it('warns in Income and points to the salary schedule', async () => {
    const onOpenSalarySchedule = vi.fn();
    renderEntry({ initialMode: 'income', onOpenSalarySchedule });
    fireEvent.change(screen.getByPlaceholderText(/Salary payout/i), { target: { value: 'Salary for November' } });
    const banner = screen.getByTestId('assist-salary');
    expect(banner).toHaveTextContent(/already in the plan/);
    fireEvent.click(within(banner).getByRole('button', { name: 'Update salary instead' }));
    await waitFor(() => expect(onOpenSalarySchedule).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('"It\'s extra income" lets the entry go ahead', () => {
    renderEntry({ initialMode: 'income' });
    fireEvent.change(screen.getByPlaceholderText(/Salary payout/i), { target: { value: 'Salary arrears' } });
    fireEvent.click(screen.getByRole('button', { name: "It's extra income" }));
    expect(screen.queryByTestId('assist-salary')).not.toBeInTheDocument();
  });
});

describe('Phase 5: someone else\'s money?', () => {
  const ravi = { id: 'f1', personName: 'Ravi', direction: 'lent', outstanding: 300000 };

  it('reads names of known people and the wording', () => {
    expect(detectPersonHint({ description: 'Ravi paid', flow: 'in', funds: [ravi] })).toMatchObject({ action: 'repaid', fund: ravi });
    expect(detectPersonHint({ description: 'Cash from Meera to keep', flow: 'in' })).toMatchObject({ action: 'hold', personName: 'Meera' });
    expect(detectPersonHint({ description: 'Lent to Arjun', flow: 'out' })).toMatchObject({ action: 'lend', personName: 'Arjun' });
    expect(detectPersonHint({ description: 'Groceries', flow: 'out' })).toBeNull();
  });

  it('"Track as held" opens Move > A person with the action and name filled in', async () => {
    renderEntry({ initialMode: 'income' });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2000' } });
    fireEvent.change(screen.getByPlaceholderText(/Salary payout/i), { target: { value: 'Cash from Meera to keep' } });
    fireEvent.click(within(screen.getByTestId('assist-person')).getByRole('button', { name: 'Track as held' }));
    expect(await screen.findByTestId('held-lent-form')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Receive to hold' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/Amount/)).toHaveValue(2000);
    expect(await screen.findByLabelText('Person name')).toHaveValue('Meera');
  });
});

describe('Phase 5: expected repayment date', () => {
  it('offered when lending or holding, not when returning', async () => {
    const { unmount } = render(<HeldLentForm bankAccounts={[bank]} wallets={[wallet]} initialAction="lend" />);
    expect(screen.getByText("They'll pay back by")).toBeInTheDocument();
    unmount();
    render(<HeldLentForm bankAccounts={[bank]} wallets={[wallet]} initialAction="return" />);
    await waitFor(() => expect(api.getPersonFunds).toHaveBeenCalled());
    expect(screen.queryByText("They'll pay back by")).not.toBeInTheDocument();
    expect(screen.queryByText('Give back by')).not.toBeInTheDocument();
  });
});

describe('Phase 5: change type', () => {
  it('offers the other types and hands the values over', async () => {
    const onConvertEntry = vi.fn();
    const spend = { _id: 't1', id: 't1', origin: 'spot', status: 'successful', title: 'Cash to Ravi', amount: 300000, date: '2026-11-10', category: 'Other', accountId: 'b1' };
    renderEntry({ initialItem: spend, initialMode: 'log', onConvertEntry, onDeleteEntry: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Change type' }));
    const menu = screen.getByTestId('convert-menu');
    expect(within(menu).queryByRole('button', { name: 'Spend' })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('button', { name: 'Move' }));
    expect(onConvertEntry).toHaveBeenCalledWith(spend, 'transfer', expect.objectContaining({
      amount: 300000, date: '2026-11-10', note: 'Cash to Ravi', accountId: 'b1'
    }));
  });

  it('the new tab opens with the carried values', () => {
    renderEntry({ initialMode: 'income', initialPreset: { carry: { amount: 300000, date: '2026-11-10', note: 'Refund', accountId: 'w1' }, replaces: { id: 't1' } } });
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(3000);
    expect(screen.getByPlaceholderText(/Salary payout/i)).toHaveValue('Refund');
    expect(document.body.querySelector('.app-select-trigger')).toHaveTextContent('Cash Wallet');
  });
});

describe('Phase 5: card bill differences', () => {
  const draftCard = {
    id: 'c1', name: 'Visa', statementDay: 20, dueDay: 8, creditLimit: 5000000, outstanding: 210000,
    unbilledSoFar: 0, cycleEnd: '2026-12-20', cycleDueDate: '2027-01-08', payFromAccountId: 'b1', openingBalance: 0,
    openBill: { statementId: 's1', remaining: 200000, amount: 200000, dueDate: '2026-12-08', isDraft: true },
    statements: [{ id: 's1', isDraft: true, amount: 200000, computedAmount: 200000, newSpend: 180000, cycleStart: '2026-10-21', cycleEnd: '2026-11-20', dueDate: '2026-12-08' }]
  };

  it('shows the difference as you type and can skip logging it', async () => {
    api.getCards.mockResolvedValue([draftCard]);
    api.confirmCardStatement.mockResolvedValue({});
    render(<CardsPanel bankAccounts={[bank]} wallets={[wallet]} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Visa/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByTestId('bill-difference')).toHaveTextContent(/Matches what the app worked out/);
    fireEvent.change(screen.getByLabelText(/Bill amount/), { target: { value: '2041.20' } });
    expect(screen.getByTestId('bill-difference')).toHaveTextContent(/\+₹41\.20.*fees or interest/);
    fireEvent.click(screen.getByRole('button', { name: /Just update the bill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bill' }));
    await waitFor(() => expect(api.confirmCardStatement).toHaveBeenCalledWith('s1', expect.objectContaining({
      statementAmount: 204120,
      logChargesDifference: false
    })));
  });
});
