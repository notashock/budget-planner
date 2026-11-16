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

  it('does not raise false warning when account live balance is ~11k with lowest ~4k and logging 250 rs expense (even if DB currentBalance is 0)', async () => {
    const handleLogTx = vi.fn().mockResolvedValue({});

    // Account mimicking actual DB record: openingBalance is 4k, currentBalance is 0 (PostgreSQL default), minimumBalance is 1k
    const realBankAccounts = [
      {
        id: 'bank-1',
        _id: 'bank-1',
        name: 'HDFC Salary Account',
        openingBalance: 400000, // ₹4,000
        currentBalance: 0,      // PostgreSQL default value
        minimumBalance: 100000, // ₹1,000 floor
        isPrimary: true
      }
    ];

    // Authoritative live simulation result passed from App.jsx: live todayBalance is ~11k, lowest is ~4k
    const mockAccountSimulations = {
      'bank-1': {
        todayBalance: 1100000, // ₹11,000
        lowestBalance: 400000, // ₹4,000
        minimumBalance: 100000 // ₹1,000 floor
      }
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={handleLogTx}
        initialMode="log"
        bankAccounts={realBankAccounts}
        wallets={mockWallets}
        month={mockMonth}
        accountSimulations={mockAccountSimulations}
        currencySymbol="₹"
      />
    );

    // Enter spending amount of ₹250 (11k - 250 = 10,750, safely above 1k floor)
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '250' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Log expense debit/i });
    fireEvent.click(submitBtn);

    // Verify pre-flight warning modal DOES NOT appear
    expect(screen.queryByTestId('floor-breach-modal')).not.toBeInTheDocument();

    // Verify onLogTransaction is called directly
    await waitFor(() => {
      expect(handleLogTx).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25000,
          bankAccountId: 'bank-1'
        })
      );
    });
  });

  it('correctly warns when a large expense legitimately drops live balance below safety floor', async () => {
    const handleLogTx = vi.fn().mockResolvedValue({});

    const realBankAccounts = [
      {
        id: 'bank-1',
        _id: 'bank-1',
        name: 'HDFC Salary Account',
        openingBalance: 400000,
        currentBalance: 0,
        minimumBalance: 100000, // ₹1,000 floor
        isPrimary: true
      }
    ];

    const mockAccountSimulations = {
      'bank-1': {
        todayBalance: 1100000, // ₹11,000
        lowestBalance: 400000,
        minimumBalance: 100000
      }
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onLogTransaction={handleLogTx}
        initialMode="log"
        bankAccounts={realBankAccounts}
        wallets={mockWallets}
        month={mockMonth}
        accountSimulations={mockAccountSimulations}
        currencySymbol="₹"
      />
    );

    // Enter spending of ₹10,500 (11k - 10.5k = ₹500, dropping below ₹1,000 floor)
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '10500' } });

    const submitBtn = screen.getByRole('button', { name: /Log expense debit/i });
    fireEvent.click(submitBtn);

    // Verify warning appears with correct projected balance (₹500.00)
    await waitFor(() => {
      expect(screen.getByTestId('floor-breach-modal')).toBeInTheDocument();
      expect(screen.getByText('Safety Floor Warning')).toBeInTheDocument();
    });

    expect(handleLogTx).not.toHaveBeenCalled();

    // Confirm override allows logging
    const breachModal = screen.getByTestId('floor-breach-modal');
    const confirmAnywayBtn = within(breachModal).getByRole('button', { name: /Confirm Anyway/i });
    fireEvent.click(confirmAnywayBtn);

    await waitFor(() => {
      expect(handleLogTx).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1050000,
          bankAccountId: 'bank-1'
        })
      );
    });
  });

  it('does not raise false warning on transfer when source account live balance safely accommodates it', async () => {
    const handleCreateTransfer = vi.fn().mockResolvedValue({});

    const realBankAccounts = [
      {
        id: 'bank-1',
        _id: 'bank-1',
        name: 'HDFC Salary Account',
        openingBalance: 400000,
        currentBalance: 0,
        minimumBalance: 100000, // ₹1,000 floor
        isPrimary: true
      }
    ];

    const mockAccountSimulations = {
      'bank-1': {
        todayBalance: 1100000, // ₹11,000 live balance
        lowestBalance: 400000,
        minimumBalance: 100000
      }
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        onCreateTransfer={handleCreateTransfer}
        initialMode="transfer"
        bankAccounts={realBankAccounts}
        wallets={mockWallets}
        month={mockMonth}
        accountSimulations={mockAccountSimulations}
        currencySymbol="₹"
      />
    );

    // Enter transfer of ₹250 from HDFC to Cash Pocket
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '250' } });

    const transferSubmitBtn = screen.getByRole('button', { name: /Record Transfer/i });
    fireEvent.click(transferSubmitBtn);

    // Verify warning does NOT appear
    expect(screen.queryByTestId('floor-breach-modal')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(handleCreateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25000,
          sourceBankAccountId: 'bank-1',
          destinationWalletId: 'wallet-1'
        })
      );
    });
  });
});
