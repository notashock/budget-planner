import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { SalarySafelineModal } from '../components/SalarySafelineModal.jsx';
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
});
