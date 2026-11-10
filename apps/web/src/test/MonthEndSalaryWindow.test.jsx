import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/Header.jsx';
import { SalarySafelineModal } from '../components/SalarySafelineModal.jsx';
import { getSalaryWindowStatus } from '@budget/engine';

describe('Month-End Salary Window (5 Days Before to 5 Days After Month-End)', () => {
  const mockUser = { id: 'u1', name: 'Ashu', email: 'ashu@example.com' };
  const mockBank = {
    id: 'bank-1',
    _id: 'bank-1',
    name: 'Salary Checking',
    institution: 'HDFC',
    isPrimary: true
  };

  const novemberMonth = {
    id: 'm-nov-2026',
    year: 2026,
    month: 11,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    incomeAmount: 5000000,
    safetyFloor: 1000000,
    salaryBankAccountId: 'bank-1',
    salaryAccountId: 'bank-1',
    isClosed: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evaluates November 2026 on November 4 as unlocked and active in the 10-day window', () => {
    const status = getSalaryWindowStatus(novemberMonth, new Date(Date.UTC(2026, 10, 4, 12, 0, 0)));
    expect(status.isLocked).toBe(false);
    expect(status.status).toBe('in_window');
    expect(status.windowStartDate).toBe('2026-10-27');
    expect(status.windowEndDate).toBe('2026-11-05');
  });

  it('renders "Link Salary & Safeline" unlocked in Header during the active window on Nov 4', () => {
    const handleOpenSalarySafeline = vi.fn();
    render(
      <Header
        currentMonth={novemberMonth}
        months={[novemberMonth]}
        user={mockUser}
        onOpenSalarySafeline={handleOpenSalarySafeline}
      />
    );

    // Open user settings dropdown
    const avatarBtn = screen.getByLabelText('Account Settings');
    fireEvent.click(avatarBtn);

    const linkBtn = screen.getByTestId('link-salary-safeline-btn');
    expect(linkBtn).toBeInTheDocument();
    expect(linkBtn).not.toBeDisabled();

    fireEvent.click(linkBtn);
    expect(handleOpenSalarySafeline).toHaveBeenCalled();
  });

  it('allows editing salary amount and credit date inside SalarySafelineModal during the window', async () => {
    const handleSave = vi.fn().mockResolvedValue({});
    const handleClose = vi.fn();

    render(
      <SalarySafelineModal
        isOpen={true}
        onClose={handleClose}
        month={novemberMonth}
        bankAccounts={[mockBank]}
        currencySymbol="₹"
        onSave={handleSave}
      />
    );

    expect(screen.getByText('Link Salary & Safeline')).toBeInTheDocument();

    const salaryInput = screen.getByLabelText(/monthly salary amount/i);
    const dateInput = screen.getByLabelText(/date of salary credit/i);
    const creditCheckbox = screen.getByLabelText(/salary already credited for this month/i);

    expect(salaryInput).not.toBeDisabled();
    expect(dateInput).not.toBeDisabled();
    expect(creditCheckbox).not.toBeDisabled();

    // Verify max date allows selecting throughout the month
    expect(dateInput).toHaveAttribute('max', '2026-11-30');

    // Update values to Nov 4
    fireEvent.change(salaryInput, { target: { value: '60000' } });
    fireEvent.change(dateInput, { target: { value: '2026-11-04' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /save salary & safeline/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    expect(handleSave).toHaveBeenCalledWith({
      salaryBankAccountId: 'bank-1',
      incomeAmount: 6000000,
      safetyFloor: 1000000,
      salaryCreditedDate: '2026-11-04',
      incomeCreditDate: '2026-11-04',
      isSalaryCredited: true
    });
  });
});
