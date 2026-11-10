import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';

describe('Pre-Flight Account Safety Floor Interception (Rule 4 & TC-ACC-05)', () => {
  const mockMonth = {
    year: 2026,
    month: 11,
    currencySymbol: '₹',
    incomeAmount: 5000000,
    safetyFloor: 1000000
  };

  const mockBankAccounts = [
    {
      id: 'bank-1',
      _id: 'bank-1',
      name: 'HDFC Salary Account',
      openingBalance: 5000000, // ₹50,000
      minimumBalance: 1000000, // ₹10,000 floor
      isPrimary: true
    }
  ];

  const mockWallets = [
    {
      id: 'wallet-1',
      _id: 'wallet-1',
      name: 'Cash Pocket',
      openingBalance: 200000, // ₹2,000
      minimumBalance: 0,
      isPrimary: false
    }
  ];

  it('intercepts spending that breaches account minimum balance with pre-flight warning and allows override', async () => {
    const handleLogTx = vi.fn().mockResolvedValue({});

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={handleLogTx}
        initialMode="log"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        month={mockMonth}
        currencySymbol="₹"
      />
    );

    // Enter spending amount of ₹45,000 (leaves ₹5,000, breaching ₹10,000 floor)
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '45000' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Log expense debit/i });
    fireEvent.click(submitBtn);

    // Verify pre-flight warning modal appears
    await waitFor(() => {
      expect(screen.getByTestId('floor-breach-modal')).toBeInTheDocument();
      expect(screen.getByText('Safety Floor Warning')).toBeInTheDocument();
    });

    // Verify onLogTransaction has NOT been called yet
    expect(handleLogTx).not.toHaveBeenCalled();

    // Click "Cancel" within warning modal
    const breachModal = screen.getByTestId('floor-breach-modal');
    const cancelBtn = within(breachModal).getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByTestId('floor-breach-modal')).not.toBeInTheDocument();
    expect(handleLogTx).not.toHaveBeenCalled();

    // Submit again and click "Confirm Anyway"
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByTestId('floor-breach-modal')).toBeInTheDocument();
    });

    const activeModal = screen.getByTestId('floor-breach-modal');
    const confirmAnywayBtn = within(activeModal).getByRole('button', { name: /Confirm Anyway/i });
    fireEvent.click(confirmAnywayBtn);

    await waitFor(() => {
      expect(handleLogTx).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4500000,
          bankAccountId: 'bank-1'
        })
      );
    });
  });

  it('intercepts inter-account transfer that breaches source account safety floor', async () => {
    const handleCreateTransfer = vi.fn().mockResolvedValue({});

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onCreateTransfer={handleCreateTransfer}
        initialMode="transfer"
        bankAccounts={mockBankAccounts}
        wallets={mockWallets}
        month={mockMonth}
        currencySymbol="₹"
      />
    );

    // Enter transfer amount of ₹45,000 from HDFC to Cash Pocket
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '45000' } });

    const transferSubmitBtn = screen.getByRole('button', { name: /Record Transfer/i });
    fireEvent.click(transferSubmitBtn);

    // Pre-flight warning modal should appear
    await waitFor(() => {
      expect(screen.getByTestId('floor-breach-modal')).toBeInTheDocument();
      expect(screen.getByText('Safety Floor Warning')).toBeInTheDocument();
    });

    expect(handleCreateTransfer).not.toHaveBeenCalled();

    // Click "Confirm Anyway"
    const breachModal = screen.getByTestId('floor-breach-modal');
    const confirmAnywayBtn = within(breachModal).getByRole('button', { name: /Confirm Anyway/i });
    fireEvent.click(confirmAnywayBtn);

    await waitFor(() => {
      expect(handleCreateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4500000,
          sourceBankAccountId: 'bank-1',
          destinationWalletId: 'wallet-1'
        })
      );
    });
  });
});
