import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// The day-insights panel below the chart repeats the selected day's entries,
// so tooltip assertions are scoped to the SVG.
const tooltip = () => within(document.querySelector('.chart-svg'));
import { StepLineChart, formatChartTick } from '../components/StepLineChart.jsx';

const mockDailyBalances = [
  { day: 1, balance: 5000, date: '2026-10-01' },
  { day: 2, balance: 4500, date: '2026-10-02' },
  { day: 3, balance: 3200, date: '2026-10-03' },
  { day: 4, balance: 3200, date: '2026-10-04' },
  { day: 5, balance: 2800, date: '2026-10-05' }
];

const mockEvents = [
  { day: 2, amount: -500, name: 'Groceries' },
  { day: 3, amount: -1300, name: 'Utilities' }
];

describe('StepLineChart component', () => {
  it('renders fallback when dailyBalances is empty', () => {
    render(<StepLineChart dailyBalances={[]} />);
    expect(screen.getByText(/no balance history available/i)).toBeInTheDocument();
  });

  it('renders SVG chart with title, balance legend, and safety floor', () => {
    render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={100000}
        currencySymbol="₹"
      />
    );

    expect(screen.getByText('Daily balance timeline')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.queryByText('Expenses')).not.toBeInTheDocument();
    expect(screen.getByText(/^Floor: ₹1,000.00$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Safety floor: ₹1,000.00$/i)).toBeInTheDocument();
  });

  it('handles touch gestures (onTouchStart, onTouchMove, onTouchEnd) without throwing handleTouch errors', () => {
    const { container } = render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
      />
    );

    const chartContainer = container.querySelector('.chart-container');
    expect(chartContainer).toBeInTheDocument();

    // Mock getBoundingClientRect
    vi.spyOn(chartContainer, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 175,
      right: 600,
      bottom: 175
    });

    // Touch start and move should not throw ReferenceError
    expect(() => {
      fireEvent.touchStart(chartContainer, {
        touches: [{ clientX: 150, clientY: 80 }]
      });
      fireEvent.touchMove(chartContainer, {
        touches: [{ clientX: 300, clientY: 80 }]
      });
      fireEvent.touchEnd(chartContainer);
      fireEvent.touchCancel(chartContainer);
    }).not.toThrow();
  });

  it('triggers onSelectDay callback when a data point is clicked', () => {
    const onSelectDay = vi.fn();
    const { container } = render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={null}
        onSelectDay={onSelectDay}
      />
    );

    // Hit-box circles have cursor: pointer
    const hitboxes = container.querySelectorAll('circle[style*="cursor: pointer"]');
    expect(hitboxes.length).toBe(mockDailyBalances.length);

    // Click on the first hitbox
    fireEvent.click(hitboxes[0]);
    expect(onSelectDay).toHaveBeenCalledWith(1);
  });

  it('displays selected day tag and allows clearing day selection', () => {
    const onSelectDay = vi.fn();
    render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={3}
        onSelectDay={onSelectDay}
      />
    );

    const dayTag = screen.getByText(/Day 3/i);
    expect(dayTag).toBeInTheDocument();

    fireEvent.click(dayTag);
    expect(onSelectDay).toHaveBeenCalledWith(null);
  });

  it('displays transaction details or day summary in tooltip on day selection', () => {
    const { rerender } = render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={2}
      />
    );

    // Day 2 has a single transaction: Groceries (-₹5.00), balance ₹45.00
    expect(tooltip().getByText('Groceries')).toBeInTheDocument();
    expect(tooltip().getByText('-₹5.00')).toBeInTheDocument();
    expect(screen.getByText('Balance:')).toBeInTheDocument();
    expect(screen.getByText('Day End:')).toBeInTheDocument();
    expect(screen.getAllByText('₹45.00').length).toBeGreaterThanOrEqual(1);

    // Day 4 has no transactions: renders Opening, Spending, Closing summary
    rerender(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={4}
      />
    );

    expect(screen.getByText('Opening:')).toBeInTheDocument();
    expect(screen.getByText('Spending:')).toBeInTheDocument();
    expect(screen.getByText('Closing:')).toBeInTheDocument();
    expect(screen.getAllByText('₹32.00').length).toBeGreaterThanOrEqual(1);
  });

  describe('Individual Account Filtering & Anti-Spike Protection', () => {
    const bankA = { id: 'bank-a', name: 'Primary Salary Bank', type: 'bank', openingBalance: 1200000 };
    const bankB = { id: 'bank-b', name: 'Savings Reserve', type: 'bank', openingBalance: 910000 };
    // Total combined net worth = 21,100.00 (2110000 minor units)

    const accountDailyBalances = [
      { day: 1, balance: 1200000, date: '2026-10-01' },
      { day: 2, balance: 1150000, date: '2026-10-02' },
      { day: 3, balance: 1050000, date: '2026-10-03' },
      { day: 4, balance: 1050000, date: '2026-10-04' }
    ];

    const eventsWithGlobalSpikePotential = [
      {
        day: 2,
        date: '2026-10-02',
        amount: -50000,
        bankAccountId: 'bank-a',
        name: 'Grocery Store',
        balanceAfter: 2060000, // GLOBAL balance across all accounts: 20.6k!
        accountBalanceAfter: 1150000, // Bank A balance: 11.5k
        accountBalances: { 'bank-a': 1150000, 'bank-b': 910000 }
      },
      {
        day: 3,
        date: '2026-10-03',
        amount: -100000,
        bankAccountId: 'bank-a',
        name: 'Electric Bill',
        balanceAfter: 1960000, // GLOBAL balance: 19.6k!
        accountBalanceAfter: 1050000, // Bank A balance: 10.5k
        accountBalances: { 'bank-a': 1050000, 'bank-b': 910000 }
      },
      {
        day: 3,
        date: '2026-10-03',
        amount: -40000,
        bankAccountId: 'bank-b', // Event for another account (Bank B)!
        name: 'Bank B Service Fee',
        balanceAfter: 1920000,
        accountBalanceAfter: 870000,
        accountBalances: { 'bank-a': 1050000, 'bank-b': 870000 }
      }
    ];

    it('isolates account balance scale from global net worth, preventing Y-axis spikes', () => {
      render(
        <StepLineChart
          dailyBalances={accountDailyBalances}
          events={eventsWithGlobalSpikePotential}
          safetyFloor={200000} // ₹2,000 floor
          currencySymbol="₹"
          selectedAccountId="bank-a"
          selectedAccount={bankA}
          bankAccounts={[bankA, bankB]}
        />
      );

      // Y-axis max should be ~12k + 12% headroom (~₹13.4k), NEVER ₹21.1k or ₹23.6k!
      expect(screen.queryByText(/₹21.1k/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/₹23.6k/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/₹20.6k/i)).not.toBeInTheDocument();

      // Floor should be formatted correctly
      expect(screen.getByText(/^Floor: ₹2,000.00$/i)).toBeInTheDocument();
    });

    it('renders accurate account balance in tooltip on day selection without leaking global balance', () => {
      render(
        <StepLineChart
          dailyBalances={accountDailyBalances}
          events={eventsWithGlobalSpikePotential}
          safetyFloor={200000}
          currencySymbol="₹"
          selectedAccountId="bank-a"
          selectedAccount={bankA}
          selectedDay={2}
          bankAccounts={[bankA, bankB]}
        />
      );

      // Day 2 has 'Grocery Store' (-₹500.00). Balance on Bank A should be ₹11,500.00, NOT ₹20,600.00!
      expect(tooltip().getByText('Grocery Store')).toBeInTheDocument();
      expect(tooltip().getByText('-₹500.00')).toBeInTheDocument();
      expect(screen.getAllByText('₹11,500.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('₹20,600.00')).not.toBeInTheDocument();
    });

    it('excludes foreign account events from tooltip and curve calculations', () => {
      render(
        <StepLineChart
          dailyBalances={accountDailyBalances}
          events={eventsWithGlobalSpikePotential}
          safetyFloor={200000}
          currencySymbol="₹"
          selectedAccountId="bank-a"
          selectedAccount={bankA}
          selectedDay={3}
          bankAccounts={[bankA, bankB]}
        />
      );

      // Day 3 has 'Electric Bill' on Bank A, and 'Bank B Service Fee' on Bank B.
      // Under Bank A view, Bank B's transaction must not appear.
      expect(tooltip().getByText('Electric Bill')).toBeInTheDocument();
      expect(screen.queryByText('Bank B Service Fee')).not.toBeInTheDocument();
      expect(screen.getAllByText('₹10,500.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('₹19,200.00')).not.toBeInTheDocument();
    });
  });

  describe('formatChartTick (Y-axis label formatting)', () => {
    it('formats numbers under 10k as plain whole values with symbol (10, 100, 1000)', () => {
      // Input values are in minor units (paisa: 100 = 1 unit)
      expect(formatChartTick(0, '₹')).toBe('₹0');
      expect(formatChartTick(1000, '₹')).toBe('₹10');
      expect(formatChartTick(10000, '₹')).toBe('₹100');
      expect(formatChartTick(100000, '₹')).toBe('₹1000');
      expect(formatChartTick(950000, '₹')).toBe('₹9500');
    });

    it('formats values at and above 10k using "k" suffix (10k, 100k)', () => {
      expect(formatChartTick(1000000, '₹')).toBe('₹10k');
      expect(formatChartTick(5000000, '₹')).toBe('₹50k');
      expect(formatChartTick(10000000, '₹')).toBe('₹100k');
      expect(formatChartTick(15500000, '₹')).toBe('₹155k');
    });

    it('formats values at and above 1m using "m" suffix', () => {
      expect(formatChartTick(100000000, '₹')).toBe('₹1m');
      expect(formatChartTick(250000000, '₹')).toBe('₹2.5m');
    });

    it('correctly handles negative values', () => {
      expect(formatChartTick(-2500000, '₹')).toBe('-₹25k');
      expect(formatChartTick(-50000, '₹')).toBe('-₹500');
    });
  });
});
