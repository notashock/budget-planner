// @vitest-environment jsdom
import './setup.js';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/Header.jsx';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';

describe('Header Dropdown and Plan Form Account Balance Audit', () => {
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;
  const nextMonthNum = currentMonthNum === 12 ? 1 : currentMonthNum + 1;
  const nextYear = currentMonthNum === 12 ? currentYear + 1 : currentYear;

  const mockMonths = [
    {
      id: 'm-current',
      year: currentYear,
      month: currentMonthNum,
      startDate: `${currentYear}-11-01`,
      endDate: `${currentYear}-11-30`,
      isClosed: false,
      currencySymbol: '₹'
    },
    {
      id: 'm-future',
      year: nextYear,
      month: nextMonthNum,
      startDate: `${nextYear}-12-01`,
      endDate: `${nextYear}-12-31`,
      isClosed: false,
      currencySymbol: '₹'
    },
    {
      id: 'm-past',
      year: currentYear,
      month: currentMonthNum > 1 ? currentMonthNum - 1 : 12,
      startDate: `${currentYear}-10-01`,
      endDate: `${currentYear}-10-31`,
      isClosed: true,
      currencySymbol: '₹'
    }
  ];

  it('Header dropdown renders active cycle and previous preview/closed cycles', () => {
    const handleSelectMonth = vi.fn();
    render(
      <Header
        months={mockMonths}
        currentMonth={mockMonths[0]}
        onSelectMonth={handleSelectMonth}
      />
    );

    // Open month picker dropdown
    const pickerBtn = screen.getByLabelText('Select month');
    fireEvent.click(pickerBtn);

    // Check header section headers
    expect(screen.getByText(/Active Planning Cycle/i)).toBeInTheDocument();
    expect(screen.getByText(/Previous Month Previews \(Read-Only\)/i)).toBeInTheDocument();
    // Future months must not be in the dropdown
    expect(screen.queryByText(/December/i)).toBeNull();
  });

  it('UnifiedEntryModal in Plan mode displays live simulated balance for the selected account', () => {
    const bankAccounts = [
      {
        id: 'acc-1',
        name: 'HDFC Salary Bank',
        isPrimary: true,
        type: 'bank',
        openingBalance: 5000000, // ₹50,000 initial
        currentBalance: 4200000, // ₹42,000 ledger balance
        minimumBalance: 1000000
      }
    ];

    const simulation = {
      accounts: {
        'acc-1': {
          id: 'acc-1',
          todayBalance: 4200000,
          endingBalance: 3500000
        }
      }
    };

    render(
      <UnifiedEntryModal
        isOpen={true}
        initialMode="plan"
        bankAccounts={bankAccounts}
        wallets={[]}
        currencySymbol="₹"
        month={mockMonths[0]}
        simulation={simulation}
        onClose={vi.fn()}
        onSaveItem={vi.fn()}
      />
    );

    // Should display Plan tab active
    expect(screen.getByText('Dedicated Account *')).toBeInTheDocument();
    // Account select should show HDFC Salary Bank
    expect(screen.getByText('HDFC Salary Bank')).toBeInTheDocument();
    // Balance displayed beside account should be ₹42,000.00 (not stale ₹50,000)
    expect(screen.getByText('₹42,000.00')).toBeInTheDocument();
  });
});
