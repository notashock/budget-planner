import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortMenu } from '../components/SortMenu.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';

const OPTIONS = [
  { value: 'recent', label: 'Most recent', short: 'Recent' },
  { value: 'oldest', label: 'Oldest first', short: 'Oldest' },
  { value: 'amount-desc', label: 'Amount: high to low', short: 'Amount ↓' }
];

describe('SortMenu', () => {
  it('opens a styled listbox, marks the current option and selects by click', () => {
    const onChange = vi.fn();
    render(<SortMenu value="recent" options={OPTIONS} onChange={onChange} label="Sort transactions" />);

    const trigger = screen.getByRole('button', { name: 'Sort transactions: Most recent' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox', { name: 'Sort transactions' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Most recent/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('option', { name: /Oldest first/ }));
    expect(onChange).toHaveBeenCalledWith('oldest');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard selection and Escape to close', () => {
    const onChange = vi.fn();
    render(<SortMenu value="recent" options={OPTIONS} onChange={onChange} label="Sort" />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('amount-desc');

    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('StepLineChart day insights', () => {
  const dailyBalances = [
    { day: 1, date: '2026-11-01', balance: 500000 },
    { day: 2, date: '2026-11-02', balance: 380000 },
    { day: 3, date: '2026-11-03', balance: 80000 }
  ];
  const events = [
    { day: 1, date: '2026-11-01', label: 'Salary', amount: 500000, isSalary: true, itemType: 'salary', balanceAfter: 500000 },
    { day: 2, date: '2026-11-02', label: 'Groceries', amount: -120000, itemType: 'unplanned-transaction', balanceAfter: 380000 },
    { day: 3, date: '2026-11-03', label: 'Rent', amount: -300000, itemType: 'recurring', balanceAfter: 80000 }
  ];

  it('summarises the selected day: balance, change, in/out, room above floor and context flags', () => {
    const { container } = render(
      <StepLineChart
        dailyBalances={dailyBalances}
        events={events}
        safetyFloor={100000}
        currencySymbol="₹"
        selectedDay={3}
        lowestDate="2026-11-03"
        safeDailyRate={50000}
      />
    );

    const panel = container.querySelector('.day-insight');
    expect(panel).toHaveTextContent('Selected day');
    expect(panel).toHaveTextContent('Closing balance₹800.00');
    expect(panel).toHaveTextContent('▼ -₹3,000.00');
    expect(panel).toHaveTextContent('+₹0.00 / -₹3,000.00');
    expect(panel).toHaveTextContent('Room above floor-₹200.00');
    expect(panel).toHaveTextContent('Lowest point of the month');
    expect(panel).toHaveTextContent('Biggest spending day');
    expect(panel).toHaveTextContent('₹200.00 below floor');
    expect(panel).toHaveTextContent('Rent');
  });

  it('flags payday and spending above the daily safe amount', () => {
    const { container, rerender } = render(
      <StepLineChart dailyBalances={dailyBalances} events={events} safetyFloor={100000} currencySymbol="₹" selectedDay={1} safeDailyRate={50000} />
    );
    expect(container.querySelector('.day-insight')).toHaveTextContent('Payday');

    rerender(
      <StepLineChart dailyBalances={dailyBalances} events={events} safetyFloor={100000} currencySymbol="₹" selectedDay={2} safeDailyRate={50000} />
    );
    expect(container.querySelector('.day-insight')).toHaveTextContent('₹700.00 over the daily safe amount');
  });
});
