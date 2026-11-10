import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineList } from '../components/TimelineList.jsx';

describe('TimelineList component', () => {
  const dummyEvents = [
    {
      day: 5,
      date: '2026-10-05',
      amount: -1500,
      balanceAfter: 20000,
      label: 'Groceries',
      itemType: 'expense',
      isActual: true,
      category: 'food'
    },
    {
      day: 1,
      date: '2026-10-01',
      amount: -2000,
      balanceAfter: 18000,
      label: 'Electricity Bill',
      itemType: 'planned-transaction',
      isActual: false,
      isPending: true,
      originalDay: 1
    }
  ];

  it('renders without throwing ReferenceError: viewScope is not defined', () => {
    expect(() => {
      render(
        <TimelineList
          events={dummyEvents}
          safetyFloor={5000}
          currencySymbol="₹"
          selectedDay={null}
          currentDay={10}
          month={{ year: 2026, month: 10, currencySymbol: '₹' }}
          selectedAccountId="all"
          bankAccounts={[]}
          wallets={[]}
          onPayTransaction={vi.fn()}
          onEditTransaction={vi.fn()}
        />
      );
    }).not.toThrow();

    expect(screen.getByText("Today's transactions")).toBeInTheDocument();
  });

  it('renders empty state cleanly when displayList is empty', () => {
    render(
      <TimelineList
        events={[]}
        safetyFloor={5000}
        currencySymbol="₹"
        selectedDay={null}
        currentDay={10}
        month={{ year: 2026, month: 10, currencySymbol: '₹' }}
      />
    );

    expect(screen.getByText(/No timeline events generated for this month/i)).toBeInTheDocument();
  });

  it('handles dynamic re-rendering from populated to empty events without hook count mismatch', () => {
    const { rerender } = render(
      <TimelineList
        events={dummyEvents}
        safetyFloor={5000}
        currencySymbol="₹"
        selectedDay={null}
        currentDay={10}
        month={{ year: 2026, month: 10, currencySymbol: '₹' }}
      />
    );

    expect(screen.getByText("Today's transactions")).toBeInTheDocument();

    // Rerender with empty events (which previously caused "Rendered fewer hooks than expected")
    expect(() => {
      rerender(
        <TimelineList
          events={[]}
          safetyFloor={5000}
          currencySymbol="₹"
          selectedDay={null}
          currentDay={10}
          month={{ year: 2026, month: 10, currencySymbol: '₹' }}
        />
      );
    }).not.toThrow();

    expect(screen.getByText(/No timeline events generated for this month/i)).toBeInTheDocument();

    // Rerender back with dummy events
    expect(() => {
      rerender(
        <TimelineList
          events={dummyEvents}
          safetyFloor={5000}
          currencySymbol="₹"
          selectedDay={null}
          currentDay={10}
          month={{ year: 2026, month: 10, currencySymbol: '₹' }}
        />
      );
    }).not.toThrow();
  });
  it("strictly displays today's transactions only and renders minimal what, how, when, amount without tag clutter", () => {
    const todayEvents = [
      {
        day: 10,
        date: '2026-10-10',
        amount: -45000,
        balanceAfter: 2000000,
        label: 'Team Lunch',
        itemType: 'expense',
        isActual: true,
        bankAccountId: 'bank-1'
      },
      {
        day: 10,
        date: '2026-10-10',
        amount: -120000,
        balanceAfter: 1880000,
        label: 'Internet Subscription',
        itemType: 'planned-transaction',
        isActual: false,
        bankAccountId: 'bank-1'
      },
      {
        day: 2,
        date: '2026-10-02',
        amount: -30000,
        balanceAfter: 2050000,
        label: 'Past Coffee',
        itemType: 'expense',
        isActual: true,
        bankAccountId: 'bank-1'
      }
    ];

    const mockBanks = [{ id: 'bank-1', name: 'HDFC Salary Checking' }];
    const handlePay = vi.fn();

    render(
      <TimelineList
        events={todayEvents}
        safetyFloor={5000}
        currencySymbol="₹"
        selectedDay={null}
        currentDay={10}
        month={{ year: 2026, month: 10, currencySymbol: '₹' }}
        selectedAccountId="all"
        bankAccounts={mockBanks}
        wallets={[]}
        onPayTransaction={handlePay}
      />
    );

    // Today's transactions are visible
    expect(screen.getByText('Team Lunch')).toBeInTheDocument();
    expect(screen.getByText('Internet Subscription')).toBeInTheDocument();

    // Past transaction is NOT visible in today's view
    expect(screen.queryByText('Past Coffee')).not.toBeInTheDocument();

    // What: Titles
    // How: Account name
    expect(screen.getAllByText('HDFC Salary Checking').length).toBe(2);

    // How much (Amounts)
    expect(screen.getByText('-₹450.00')).toBeInTheDocument();
    expect(screen.getByText('-₹1,200.00')).toBeInTheDocument();

    // Settle button for planned item
    expect(screen.getByRole('button', { name: /Settle/i })).toBeInTheDocument();

    // Clutter tags are NOT rendered
    expect(screen.queryByText(/Orig Day/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/• fixed/i)).not.toBeInTheDocument();
  });
});
