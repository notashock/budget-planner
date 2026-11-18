import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    createPersonFund: vi.fn(),
    addPersonFundEntry: vi.fn(),
    reclassifyTransaction: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main', isPrimary: true, type: 'bank' };
const ravi = { id: 'f1', personName: 'Ravi', direction: 'held', outstanding: 200000, status: 'open' };

describe('HeldLentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new person when receiving money to hold', async () => {
    api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
    api.createPersonFund.mockResolvedValue({ id: 'f9' });
    const onSaved = vi.fn();
    render(<HeldLentForm bankAccounts={[bank]} onSaved={onSaved} />);

    fireEvent.change(await screen.findByLabelText('Person name'), { target: { value: 'Meera' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1500' } });
    fireEvent.submit(screen.getByTestId('held-lent-form'));

    await waitFor(() => expect(api.createPersonFund).toHaveBeenCalled());
    expect(api.createPersonFund.mock.calls[0][0]).toMatchObject({
      personName: 'Meera',
      direction: 'held',
      amount: 150000,
      accountId: 'b1'
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('logs a return against someone and blocks returning more than is held', async () => {
    api.getPersonFunds.mockResolvedValue({ funds: [ravi], totals: { held: 200000, lent: 0 } });
    api.addPersonFundEntry.mockResolvedValue({ id: 't1' });
    render(<HeldLentForm bankAccounts={[bank]} initialAction="return" onSaved={() => {}} />);

    await screen.findByRole('option', { name: /Ravi/ });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '3000' } });
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/more than/);
    expect(api.addPersonFundEntry).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '2000' } });
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    await waitFor(() => expect(api.addPersonFundEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ flow: 'out', amount: 200000 })));
  });

  it('a return defaults to the account the money went into, and warns when another is picked', async () => {
    const cash = { id: 'w1', _id: 'w1', name: 'Cash', type: 'wallet' };
    api.getPersonFunds.mockResolvedValue({ funds: [{ ...ravi, settleAccountId: 'w1' }], totals: { held: 200000, lent: 0 } });
    api.addPersonFundEntry.mockResolvedValue({ id: 't1' });
    render(<HeldLentForm bankAccounts={[bank]} wallets={[cash]} initialAction="return" onSaved={() => {}} />);

    await screen.findByRole('option', { name: /Ravi/ });
    await waitFor(() => expect(screen.queryByTestId('hl-account-mismatch')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '2000' } });
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    await waitFor(() => expect(api.addPersonFundEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ flow: 'out', accountId: 'w1' })));
  });

  it('a return from a different account says which account it lowers', async () => {
    const cash = { id: 'w1', _id: 'w1', name: 'Cash', type: 'wallet' };
    api.getPersonFunds.mockResolvedValue({ funds: [{ ...ravi, settleAccountId: 'w1' }], totals: { held: 200000, lent: 0 } });
    render(<HeldLentForm bankAccounts={[bank]} wallets={[cash]} initialAction="return" onSaved={() => {}} />);
    await screen.findByRole('option', { name: /Ravi/ });
    fireEvent.click(await screen.findByRole('button', { name: /Cash/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Main/ }));
    expect(await screen.findByTestId('hl-account-mismatch')).toHaveTextContent("Ravi's money went into Cash. Returning it from Main lowers Main.");
  });

  it('tells the user it is not income or spending', async () => {
    api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
    render(<HeldLentForm bankAccounts={[bank]} />);
    expect(screen.getByText(/won.t count as income or spending/i)).toBeInTheDocument();
    await waitFor(() => expect(api.getPersonFunds).toHaveBeenCalled());
  });
});

describe('HeldLentForm: money already logged (incident 2026-11-18)', () => {
  const vamsi = { id: 'f2', personName: 'Vamsi', direction: 'held', outstanding: 700000, status: 'open' };
  const rentSpend = { id: 't9', name: 'Vamsi rent', amount: 700000, date: '2026-11-11', status: 'successful', origin: 'spot', isIncome: false, accountId: 'b1' };
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPersonFunds.mockResolvedValue({ funds: [vamsi], totals: { held: 700000, lent: 0 } });
  });
  const renderReturn = (props = {}) => render(
    <HeldLentForm bankAccounts={[bank]} initialAction="return" transactions={[rentSpend]} initialValues={{ date: '2026-11-11' }} month={{ year: 2026, month: 11 }} onSaved={() => {}} {...props} />
  );

  it('warns that a return was already logged as a spend and will not save it twice', async () => {
    renderReturn();
    await screen.findByRole('option', { name: /Vamsi/ });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '7000' } });
    expect(screen.getByTestId('hl-already-logged')).toHaveTextContent(/Vamsi rent/);
    expect(screen.getByTestId('hl-already-logged')).toHaveTextContent(/took this money out/);
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already logged/);
    expect(api.addPersonFundEntry).not.toHaveBeenCalled();
  });

  it('"Use that entry" moves the logged spend to the person instead of adding a new row', async () => {
    api.reclassifyTransaction.mockResolvedValue({ transaction: { id: 't9' } });
    const onSaved = vi.fn();
    renderReturn({ onSaved });
    await screen.findByRole('option', { name: /Vamsi/ });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use that entry' }));
    await waitFor(() => expect(api.reclassifyTransaction).toHaveBeenCalledWith('t9', { personFundId: 'f2' }));
    expect(api.addPersonFundEntry).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('a different payment lets it save, once, under the month being viewed', async () => {
    let resolve;
    api.addPersonFundEntry.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderReturn();
    await screen.findByRole('option', { name: /Vamsi/ });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: /different payment/ }));
    expect(screen.queryByTestId('hl-already-logged')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    fireEvent.submit(screen.getByTestId('held-lent-form'));
    resolve({ id: 'x' });
    await waitFor(() => expect(api.addPersonFundEntry).toHaveBeenCalledTimes(1));
    expect(api.addPersonFundEntry.mock.calls[0][1]).toMatchObject({ flow: 'out', amount: 700000, year: 2026, month: 11 });
  });

  it('ignores entries that are already held/lent money or a different amount', async () => {
    renderReturn({ transactions: [{ ...rentSpend, origin: 'held_return', personFundId: 'f2' }, { ...rentSpend, id: 't8', amount: 650000 }] });
    await screen.findByRole('option', { name: /Vamsi/ });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '7000' } });
    expect(screen.queryByTestId('hl-already-logged')).not.toBeInTheDocument();
  });
});
