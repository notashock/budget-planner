import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { SalarySafelineModal } from '../components/SalarySafelineModal.jsx';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { simulate } from '@budget/engine';

describe('Salary Linking and Income Logging Integration', () => {
  const mockBank = {
    _id: 'bank-1',
    id: 'bank-1',
    name: 'HDFC Bank',
    institution: 'HDFC',
    isPrimary: true,
    openingBalance: 1000000,
    minimumBalance: 500000
  };

  const mockMonth = {
    _id: 'month-1',
    year: 2026,
    month: 11,
    incomeAmount: 1928000, // ₹19,280
    incomeCreditDay: 1,
    incomeCreditDate: '2026-11-01',
    salaryCreditedDate: '2026-11-01',
    isSalaryCredited: true,
    salaryBankAccountId: 'bank-1',
    safetyFloor: 500000,
    currencySymbol: '₹',
    openingBalance: 1000000
  };

  it('preserves scheduled salary and displays combined income when ad-hoc income is logged', () => {
    // 1. Simulate month with ₹19,280 salary + ₹0.13 bonus income
    const transactions = [
      {
        id: 'tx-bonus',
        isIncome: true,
        amount: 13, // ₹0.13
        tag: 'Salary', // even with default Salary tag
        note: 'bonus',
        date: '2026-11-02',
        bankAccountId: 'bank-1'
      }
    ];

    const sim = simulate(
      {
        openingBalance: mockMonth.openingBalance,
        incomeAmount: mockMonth.incomeAmount,
        incomeCreditDay: mockMonth.incomeCreditDay,
        incomeCreditDate: mockMonth.incomeCreditDate,
        salaryBankAccountId: mockMonth.salaryBankAccountId,
        safetyFloor: mockMonth.safetyFloor,
        isSalaryCredited: true,
        salaryCreditedDate: '2026-11-01',
        currentDay: 2,
        scale: 100,
        accounts: [mockBank]
      },
      [],
      { year: mockMonth.year, month: mockMonth.month },
      transactions,
      [],
      [],
      [mockBank]
    );

    // Verify simulation output
    expect(sim.incomeAmount).toBe(1928013);
    expect(sim.floorBreached).toBe(false);

    // 2. Render DetailedKpiGrid in Unified view
    const { unmount } = render(
      <DetailedKpiGrid
        incomeAmount={sim.incomeAmount}
        incomeCreditDay={mockMonth.incomeCreditDay}
        events={sim.events}
        totalExpenses={sim.totalExpenses}
        endingBalance={sim.endingBalance}
        todayBalance={sim.todayBalance}
        lowestBalance={sim.lowestBalance}
        lowestDate={sim.lowestDate}
        safetyFloor={sim.safetyFloor}
        currencySymbol="₹"
        isSalaryCredited={sim.isSalaryCredited}
        salaryCreditedDate={sim.salaryCreditedDate}
        canEditSalary={true}
        month={mockMonth}
      />
    );

    // Verify KPI card displays combined income and confirmed credit
    expect(screen.getByText('Monthly income')).toBeInTheDocument();
    expect(screen.getByText('₹19,280.13')).toBeInTheDocument();
    expect(screen.getByText('✓ Credited')).toBeInTheDocument();
    unmount();

    // 3. Render TimelineList
    render(
      <TimelineList
        events={sim.events}
        currencySymbol="₹"
        safetyFloor={sim.safetyFloor}
        bankAccounts={[mockBank]}
        wallets={[]}
      />
    );

    // Verify timeline distinguishes salary from ad-hoc income
    expect(screen.getByText(/salary • credited/i)).toBeInTheDocument();
    expect(screen.getByText(/income • actual credited/i)).toBeInTheDocument();
  });

  it('updates salaryCreditedDate and isSalaryCredited when modified in SalarySafelineModal', async () => {
    const handleSave = vi.fn().mockResolvedValue({});
    const handleClose = vi.fn();

    render(
      <SalarySafelineModal
        isOpen={true}
        onClose={handleClose}
        month={mockMonth}
        bankAccounts={[mockBank]}
        currencySymbol="₹"
        onSave={handleSave}
      />
    );

    const dateInput = screen.getByLabelText(/date of salary credit/i);
    fireEvent.change(dateInput, { target: { value: '2026-11-05' } });

    const saveBtn = screen.getByRole('button', { name: /save salary & safeline/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        salaryBankAccountId: 'bank-1',
        incomeAmount: 1928000,
        safetyFloor: 500000,
        salaryCreditedDate: '2026-11-05',
        incomeCreditDate: '2026-11-05',
        isSalaryCredited: true
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });
  it('allows editing safeline floor while locking salary fields when outside 10-day window', async () => {
    // Month 9 of 2026 is completely past and locked on 2026-11-01
    const lockedMonth = {
      ...mockMonth,
      _id: 'month-locked',
      year: 2026,
      month: 9
    };

    const handleSave = vi.fn().mockResolvedValue({});
    const handleClose = vi.fn();

    render(
      <SalarySafelineModal
        isOpen={true}
        onClose={handleClose}
        month={lockedMonth}
        bankAccounts={[mockBank]}
        currencySymbol="₹"
        onSave={handleSave}
      />
    );

    // Verify lock banner
    expect(screen.getByTestId('salary-lock-banner')).toBeInTheDocument();
    expect(screen.getByText(/safeline floor remains editable/i)).toBeInTheDocument();

    // Verify salary fields are disabled
    expect(screen.getByLabelText(/salary credited account/i)).toBeDisabled();
    expect(screen.getByLabelText(/monthly salary amount/i)).toBeDisabled();
    expect(screen.getByLabelText(/date of salary credit/i)).toBeDisabled();
    expect(screen.getByLabelText(/salary already credited for this month/i)).toBeDisabled();

    // Verify safeline floor input is enabled
    const safelineInput = screen.getByLabelText(/overall safeline floor/i);
    expect(safelineInput).toBeEnabled();

    // Verify submit button label
    const submitBtn = screen.getByRole('button', { name: /update safeline floor/i });
    expect(submitBtn).toBeEnabled();

    // Edit safeline floor and submit
    fireEvent.change(safelineInput, { target: { value: '8000' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        safetyFloor: 800000
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('displays mid-month notice when creating/configuring salary mid-month for unconfigured month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));

    const unconfiguredMonth = {
      _id: 'month-unconfigured',
      year: 2026,
      month: 11,
      incomeAmount: 0,
      salaryBankAccountId: null,
      safetyFloor: 0
    };

    render(
      <SalarySafelineModal
        isOpen={true}
        onClose={vi.fn()}
        month={unconfiguredMonth}
        bankAccounts={[mockBank]}
        currencySymbol="₹"
        onSave={vi.fn()}
      />
    );

    expect(screen.getByTestId('mid-month-warning-banner')).toBeInTheDocument();
    expect(screen.getByText(/this initial salary setup will lock immediately upon saving until next month-end/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('excludes Salary from ad-hoc income categories and renders link salary guidance in UnifiedEntryModal', () => {
    render(
      <UnifiedEntryModal
        isOpen={true}
        onClose={vi.fn()}
        currentMonth={mockMonth}
        bankAccounts={[mockBank]}
        wallets={[]}
        plannedItems={[]}
        currencySymbol="₹"
        initialMode="income"
      />
    );

    // Verify category buttons
    expect(screen.getByRole('button', { name: 'Bonus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freelance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Investment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salary' })).not.toBeInTheDocument();

    // Verify sole truth helper guidance text
    expect(screen.getByText(/your primary monthly salary is managed via link salary & safeline/i)).toBeInTheDocument();
  });
  it('auto-heals ghost or invalid salaryBankAccountId by falling back to primary bank and submits successfully', async () => {
    // Month has an invalid/ghost salary bank account ID that does not exist in bankAccounts
    const monthWithGhostBank = {
      ...mockMonth,
      salaryBankAccountId: 'deleted-or-ghost-bank-999'
    };

    const handleSave = vi.fn().mockResolvedValue({});
    const handleClose = vi.fn();

    render(
      <SalarySafelineModal
        isOpen={true}
        onClose={handleClose}
        month={monthWithGhostBank}
        bankAccounts={[mockBank]}
        currencySymbol="₹"
        onSave={handleSave}
      />
    );

    // Verify the select has selected mockBank._id ('bank-1'), not the ghost bank ID
    const bankSelect = screen.getByLabelText(/salary credited account/i);
    expect(bankSelect.value).toBe('bank-1');

    // Submit the form
    const saveBtn = screen.getByRole('button', { name: /save salary & safeline/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          salaryBankAccountId: 'bank-1'
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
