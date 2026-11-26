import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PeoplePanel } from '../components/PeoplePanel.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getPersonFunds: vi.fn(),
    getPersonFund: vi.fn(),
    updatePersonFund: vi.fn(),
    deletePersonFund: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn()
  }
}));

const rahul = { id: 'f1', personName: 'Rahul', direction: 'lent', status: 'open', outstanding: 50000, entryCount: 1, note: '', expectedSettleDate: null };
const lentEntry = { id: 't1', origin: 'lent_out', name: 'Lent', amount: 50000, date: '2026-11-10', status: 'successful' };

describe('PeoplePanel (Held & Lent rows with edit and delete)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPersonFunds.mockResolvedValue({ funds: [rahul], totals: { held: 0, lent: 50000 } });
    api.getPersonFund.mockResolvedValue({ ...rahul, entries: [lentEntry] });
    api.updatePersonFund.mockResolvedValue({});
    api.deletePersonFund.mockResolvedValue({});
    api.updateTransaction.mockResolvedValue({});
    api.deleteTransaction.mockResolvedValue({});
  });

  const openRahul = async () => {
    render(<PeoplePanel />);
    fireEvent.click(await screen.findByRole('button', { name: /^Rahul/ }));
    await screen.findByText('Lent');
  };

  it('shows each person as a row with what they owe, and the total underneath', async () => {
    render(<PeoplePanel />);
    const row = await screen.findByRole('button', { name: /^Rahul/ });
    expect(row).toHaveTextContent('Owes you');
    expect(row).toHaveTextContent('₹500');
    expect(screen.getByText(/Others owe you ₹500\. Never counted as income or spending\./)).toBeInTheDocument();
  });

  it('edits a person\'s details', async () => {
    await openRahul();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Rahul' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit details' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Rahul K' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Concert tickets' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updatePersonFund).toHaveBeenCalledWith('f1', { personName: 'Rahul K', note: 'Concert tickets', expectedSettleDate: null }));
  });

  it('edits an entry\'s amount, keeping its direction', async () => {
    await openRahul();
    fireEvent.click(screen.getByRole('button', { name: /^Actions for Lent on/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: '650' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('t1', { amount: 65000, date: '2026-11-10' }));
  });

  it('deletes an entry after confirming', async () => {
    await openRahul();
    fireEvent.click(screen.getByRole('button', { name: /^Actions for Lent on/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = within(await screen.findByTestId('held-lent-modal'));
    expect(dialog.getByText(/The account balance it moved goes back/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledWith('t1'));
  });

  it('deletes a person and their entries in one call after confirming', async () => {
    await openRahul();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Rahul' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete person' }));
    const dialog = within(await screen.findByTestId('held-lent-modal'));
    expect(dialog.getByRole('heading', { name: 'Delete Rahul?' })).toBeInTheDocument();
    expect(dialog.getByText(/Their entries are deleted too/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deletePersonFund).toHaveBeenCalledWith('f1', { withEntries: true }));
    expect(api.deleteTransaction).not.toHaveBeenCalled();
  });

  it('shows a delete error inside the confirm step', async () => {
    api.deletePersonFund.mockRejectedValueOnce(new Error('An entry for this person is in closed review period 2026-10.'));
    await openRahul();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Rahul' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete person' }));
    const dialog = within(await screen.findByTestId('held-lent-modal'));
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(/closed review period/);
  });

  it('review mode has no edit or delete actions', async () => {
    render(<PeoplePanel isReviewMode />);
    fireEvent.click(await screen.findByRole('button', { name: /^Rahul/ }));
    await screen.findByText('Lent');
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });
});
