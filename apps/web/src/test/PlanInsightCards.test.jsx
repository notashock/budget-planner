import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpcomingOutflows } from '../components/UpcomingOutflows.jsx';
import { AllowancePaceMeter } from '../components/AllowancePaceMeter.jsx';

describe('UpcomingOutflows', () => {
  const events = [
    { itemId: 'i-1', label: 'Internet', date: '2026-11-14', amount: -120000 },
    { itemId: 'i-2', label: 'Electricity', date: '2026-11-17', amount: -340000 },
    { itemId: 'i-3', label: 'Rent', date: '2026-11-21', amount: -4000000 },
    { itemId: 'i-4', label: 'Far away', date: '2026-11-28', amount: -999 },
    { transactionId: 't-1', label: 'Coffee', date: '2026-11-16', amount: -45000, isActual: true },
    { label: 'Salary', date: '2026-11-30', amount: 13500000, isSalary: true }
  ];

  it('lists overdue then due payments with a total and days to salary', () => {
    render(<UpcomingOutflows events={events} todayStr="2026-11-17" currencySymbol="₹" onPay={vi.fn()} />);

    expect(screen.getByText('Next 7 days')).toBeInTheDocument();
    expect(screen.getByText('₹44,600.00')).toBeInTheDocument();
    expect(screen.getByText(/3 payments · 1 overdue · 13 days to salary/)).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText(/^Overdue ·/)).toBeInTheDocument();

    const names = screen.getAllByText(/Internet|Electricity|Rent/).map((n) => n.textContent);
    expect(names).toEqual(['Internet', 'Electricity', 'Rent']);
    expect(screen.queryByText('Far away')).not.toBeInTheDocument();
    expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
  });

  it('marks a payment as paid through the callback', () => {
    const onPay = vi.fn();
    render(<UpcomingOutflows events={events} todayStr="2026-11-17" currencySymbol="₹" onPay={onPay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Rent as paid' }));
    expect(onPay).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'i-3' }));
  });

  it('hides pay buttons in review mode and shows an empty state when nothing is due', () => {
    const { rerender } = render(
      <UpcomingOutflows events={events} todayStr="2026-11-17" currencySymbol="₹" onPay={vi.fn()} isReviewMode />
    );
    expect(screen.queryByRole('button', { name: /as paid/ })).not.toBeInTheDocument();

    rerender(<UpcomingOutflows events={[]} todayStr="2026-11-17" currencySymbol="₹" />);
    expect(screen.getByText('Nothing to pay this week.')).toBeInTheDocument();
  });

  it('renders nothing without a reference date', () => {
    const { container } = render(<UpcomingOutflows events={events} todayStr={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AllowancePaceMeter', () => {
  it('shows spending ahead of an even pace', () => {
    render(
      <AllowancePaceMeter
        unplannedAllowance={1000000}
        totalUnplannedSpent={620000}
        daysElapsed={15}
        daysInMonth={30}
        currencySymbol="₹"
      />
    );

    expect(screen.getByText('Unplanned allowance')).toBeInTheDocument();
    expect(screen.getByText('Over pace')).toBeInTheDocument();
    expect(screen.getByText('₹6,200.00')).toBeInTheDocument();
    expect(screen.getByText(/₹1,200.00 ahead of an even pace for day 15/)).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '620000');
  });

  it('reports on pace and renders nothing without an allowance', () => {
    const { rerender, container } = render(
      <AllowancePaceMeter unplannedAllowance={1000} totalUnplannedSpent={500} daysElapsed={15} daysInMonth={30} />
    );
    expect(screen.getByText('On pace')).toBeInTheDocument();

    rerender(<AllowancePaceMeter unplannedAllowance={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
