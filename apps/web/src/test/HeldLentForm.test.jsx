import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    createPersonFund: vi.fn(),
    addPersonFundEntry: vi.fn()
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

  it('tells the user it is not income or spending', async () => {
    api.getPersonFunds.mockResolvedValue({ funds: [], totals: { held: 0, lent: 0 } });
    render(<HeldLentForm bankAccounts={[bank]} />);
    expect(screen.getByText(/won.t count as income or spending/i)).toBeInTheDocument();
    await waitFor(() => expect(api.getPersonFunds).toHaveBeenCalled());
  });
});
