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
});
