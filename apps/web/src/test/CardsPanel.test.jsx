import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardsPanel } from '../components/CardsPanel.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getCards: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    confirmCardStatement: vi.fn(),
    payCardStatement: vi.fn()
  }
}));

const bank = { id: 'b1', _id: 'b1', name: 'Main', isPrimary: true, type: 'bank' };
const draftCard = {
  id: 'c1', name: 'Visa', statementDay: 20, dueDay: 8, creditLimit: 5000000, outstanding: 210000,
  unbilledSoFar: 50000, cycleEnd: '2026-12-20', cycleDueDate: '2027-01-08', payFromAccountId: 'b1', openingBalance: 0,
  openBill: { statementId: 's1', remaining: 200000, amount: 200000, dueDate: '2026-12-08', isDraft: true },
  statements: [{ id: 's1', isDraft: true, amount: 200000, computedAmount: 200000, newSpend: 180000, cycleStart: '2026-10-21', cycleEnd: '2026-11-20', dueDate: '2026-12-08' }]
};
const payability = { score: 32, band: 'over', bandLabel: 'Over', statement: "At your current pace this card's bill will be about ₹4,000. You're ₹500 over." };

describe('CardsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows what is owed, the bill to confirm and the payability score', async () => {
    api.getCards.mockResolvedValue([draftCard]);
    render(<CardsPanel bankAccounts={[bank]} simulationCards={[{ id: 'c1', payability }]} />);
    expect(await screen.findByText('Visa')).toBeInTheDocument();
    expect(screen.getByText(/Bill ready/)).toBeInTheDocument();
    expect(screen.getByText('Payability: Over')).toBeInTheDocument();
    expect(screen.getByText(/₹500 over/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Payability score 32 of 100/ })).toBeInTheDocument();
  });

  it('confirms a bill with the bank amount and logs the difference', async () => {
    api.getCards.mockResolvedValue([draftCard]);
    api.confirmCardStatement.mockResolvedValue({});
    render(<CardsPanel bankAccounts={[bank]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    fireEvent.change(await screen.findByLabelText(/Bill amount/), { target: { value: '2100' } });
    expect(screen.getByText(/difference as card charges/)).toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('confirm-bill-form'));
    await waitFor(() => expect(api.confirmCardStatement).toHaveBeenCalledWith('s1', expect.objectContaining({
      statementAmount: 210000,
      logChargesDifference: true
    })));
  });

  it('pays the full open bill from the chosen account', async () => {
    api.getCards.mockResolvedValue([{ ...draftCard, openBill: { ...draftCard.openBill, isDraft: false }, statements: [{ ...draftCard.statements[0], isDraft: false }] }]);
    api.payCardStatement.mockResolvedValue({});
    render(<CardsPanel bankAccounts={[bank]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pay bill' }));
    fireEvent.submit(await screen.findByTestId('pay-bill-form'));
    await waitFor(() => expect(api.payCardStatement).toHaveBeenCalledWith('s1', expect.objectContaining({ amount: 200000, fromAccountId: 'b1' })));
  });

  it('will not add a card without the bill and due days', async () => {
    api.getCards.mockResolvedValue([]);
    render(<CardsPanel bankAccounts={[bank]} />);
    fireEvent.click(await screen.findByRole('button', { name: /Add card/ }));
    fireEvent.change(await screen.findByLabelText('Card name'), { target: { value: 'Amex' } });
    fireEvent.submit(screen.getByTestId('card-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Bill generation day/);
    expect(api.createCard).not.toHaveBeenCalled();
  });
});
