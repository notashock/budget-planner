import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpcomingOutflows } from '../components/UpcomingOutflows.jsx';
import { AllowancePaceMeter } from '../components/AllowancePaceMeter.jsx';
import { CategoryBreakdown } from '../components/CategoryBreakdown.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { RunwayGauge } from '../components/RunwayGauge.jsx';
import { IrregularHeroCards, QuarterlyBreakdownTable } from '../components/SummaryCards.jsx';

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

describe('CategoryBreakdown', () => {
  it('ranks categories by total with share and a paid/planned legend', () => {
    render(
      <CategoryBreakdown
        currencySymbol="₹"
        events={[
          { category: 'Rent', amount: -4000000 },
          { category: 'Food', amount: -150000, isActual: true },
          { category: 'Food', amount: -50000 },
          { category: 'Transfer', amount: -999999, itemType: 'transfer' },
          { label: 'Salary', amount: 13500000, isSalary: true }
        ]}
      />
    );

    expect(screen.getByText('Spending by category')).toBeInTheDocument();
    expect(screen.getByText('₹42,000.00')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    const names = Array.from(document.querySelectorAll('.cat-name')).map((n) => n.textContent);
    expect(names).toEqual(['Rent', 'Food']);
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Food: ₹2,000.00, 5% of spending; ₹1,500.00 paid, ₹500.00 planned/ })).toBeInTheDocument();
  });

  it('renders nothing when there is no spending', () => {
    const { container } = render(<CategoryBreakdown events={[{ amount: 5000, isSalary: true }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TimelineList day grouping', () => {
  it('adds one statement-style header per date with entry count and day net', () => {
    const { container } = render(
      <TimelineList
        currencySymbol="₹"
        bankAccounts={[{ _id: 'bank-1', id: 'bank-1', name: 'HDFC' }]}
        events={[
          { sourceIndex: 1, day: 1, date: '2026-11-01', label: 'Salary', amount: 5000000, balanceAfter: 5000000, itemType: 'salary', isSalary: true, isActual: true, bankAccountId: 'bank-1' },
          { sourceIndex: 2, day: 1, date: '2026-11-01', label: 'Rent', amount: -4000000, balanceAfter: 1000000, itemType: 'transaction', isActual: true, bankAccountId: 'bank-1' },
          { sourceIndex: 3, day: 5, date: '2026-11-05', label: 'Lunch', amount: -45000, balanceAfter: 955000, itemType: 'transaction', isActual: true, bankAccountId: 'bank-1' }
        ]}
      />
    );

    const headers = container.querySelectorAll('.timeline-day-header');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent('2 entries');
    expect(headers[0]).toHaveTextContent('+₹10,000.00');
    expect(headers[1]).toHaveTextContent('1 entry');
    expect(headers[1]).toHaveTextContent('-₹450.00');
  });
});

describe('Irregular income view', () => {
  it('places runway in the 3–6 month band with the balance it covers', () => {
    render(
      <RunwayGauge runwayMonths={4.2} currentBalance={4200000} avgMonthlySpending={1000000} currencySymbol="₹" />
    );
    expect(screen.getByText('Emergency runway')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('3–6 months')).toBeInTheDocument();
    expect(screen.getByText(/₹42,000.00 covers 4.2 months of average spending \(₹10,000.00\/mo\)/)).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '4.2');
  });

  it('flags under three months and handles indefinite runway', () => {
    const { rerender } = render(<RunwayGauge runwayMonths={1.5} currencySymbol="₹" />);
    expect(screen.getByText('Below 3 months')).toBeInTheDocument();

    rerender(<RunwayGauge isIndefinite runwayMonths={Infinity} currencySymbol="₹" />);
    expect(screen.getByText('Indefinite')).toBeInTheDocument();
    expect(screen.getByText('No spending recorded')).toBeInTheDocument();
  });

  it('shows a trailing-12-month savings rate among the hero tiles', () => {
    render(
      <IrregularHeroCards
        currencySymbol="₹"
        metrics={{ smoothedMonthlyIncome: 1500000, trailing12mIncome: 18000000, avgMonthlySpending: 900000, trailing12mSpending: 10800000, currentBalance: 5000000 }}
      />
    );
    expect(screen.getByText('Savings rate')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('+₹72,000.00 kept over 12 months')).toBeInTheDocument();
  });

  it('draws quarterly bars above the accessible table', () => {
    const { container } = render(
      <QuarterlyBreakdownTable
        currencySymbol="₹"
        quarters={[
          { key: '2026-Q1', income: 600000, spending: 300000, net: 300000 },
          { key: '2026-Q2', income: 100000, spending: 450000, net: -350000 }
        ]}
      />
    );
    expect(container.querySelectorAll('.qbar-row')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('-₹3,500.00').length).toBeGreaterThanOrEqual(1);
  });
});
