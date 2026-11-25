import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// The selected day's entries and figures live in the day panel under the chart.
const panel = () => within(document.querySelector('.day-insight'));
import { StepLineChart, formatChartTick } from '../components/StepLineChart.jsx';
import { getStepPath, getStepAreaPath, niceTicks, findBreachRuns } from '../components/chartGeometry.js';

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

  it('shows the selected day in the day panel: entries, closing and opening balance', () => {
    const { rerender } = render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={2}
      />
    );

    // Day 2 has a single transaction: Groceries (-₹5.00), closing ₹45.00
    expect(panel().getByText('Groceries')).toBeInTheDocument();
    expect(within(document.querySelector('.di-events')).getByText('-₹5.00')).toBeInTheDocument();
    expect(panel().getByText('₹45.00')).toBeInTheDocument();
    expect(panel().getByText('Opened at ₹50.00')).toBeInTheDocument();

    // Day 4 has no transactions
    rerender(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={4}
      />
    );

    expect(panel().getByText('No money moved on this day.')).toBeInTheDocument();
    expect(panel().getByText('₹32.00')).toBeInTheDocument();
    expect(panel().getByText('Opened at ₹32.00')).toBeInTheDocument();
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
      expect(panel().getByText('Grocery Store')).toBeInTheDocument();
      expect(within(document.querySelector('.di-events')).getByText('-₹500.00')).toBeInTheDocument();
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
      expect(panel().getByText('Electric Bill')).toBeInTheDocument();
      expect(screen.queryByText('Bank B Service Fee')).not.toBeInTheDocument();
      expect(screen.getAllByText('₹10,500.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('₹19,200.00')).not.toBeInTheDocument();
    });
  });

  describe('Step line and axis geometry', () => {
    it('draws a step-after path: horizontal to the next day, then vertical, no curves', () => {
      const d = getStepPath([{ x: 0, y: 10 }, { x: 5, y: 20 }, { x: 10, y: 15 }]);
      expect(d).toBe('M 0.0 10.0 H 5.0 V 20.0 H 10.0 V 15.0');
      expect(d).not.toMatch(/[CQS]/);
      expect(getStepAreaPath([{ x: 0, y: 10 }, { x: 5, y: 20 }], 50)).toBe('M 0.0 10.0 H 5.0 V 20.0 V 50.0 H 0.0 Z');
      expect(getStepPath([])).toBe('');
    });

    it('picks round tick values that cover the data', () => {
      // ₹0 .. ₹17,940 -> ₹0, ₹5k, ₹10k, ₹15k, ₹20k
      expect(niceTicks(0, 1794000, 4)).toEqual([0, 500000, 1000000, 1500000, 2000000]);
      const ticks = niceTicks(-250000, 1210000, 4);
      expect(ticks[0]).toBeLessThanOrEqual(-250000);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1210000);
      ticks.slice(1).forEach((v, i) => expect(v - ticks[i]).toBe(ticks[1] - ticks[0]));
    });

    it('groups days below the floor into runs', () => {
      const runs = findBreachRuns([
        { day: 1, date: 'a', balance: 500 }, { day: 2, date: 'b', balance: 90 },
        { day: 3, date: 'c', balance: 50 }, { day: 4, date: 'd', balance: 200 }, { day: 5, date: 'e', balance: 10 }
      ], 100);
      expect(runs).toEqual([
        { startDay: 2, endDay: 3, startDate: 'b', endDate: 'c', deepest: 50 },
        { startDay: 5, endDay: 5, startDate: 'e', endDate: 'e', deepest: 10 }
      ]);
      expect(findBreachRuns([{ day: 1, balance: 0 }], 0)).toEqual([]);
    });

    it('labels the y-axis with round values only', () => {
      const { container } = render(<StepLineChart dailyBalances={mockDailyBalances} events={mockEvents} safetyFloor={1000} currencySymbol="₹" />);
      const yLabels = Array.from(container.querySelectorAll('.chart-axis-text:not(.bc-x)')).map((n) => n.textContent);
      expect(yLabels).toEqual(['₹0', '₹20', '₹40', '₹60']);
    });
  });

  describe('Planner annotations', () => {
    const days = [
      { day: 1, date: '2026-11-01', balance: 900000 },
      { day: 2, date: '2026-11-02', balance: 400000 },
      { day: 3, date: '2026-11-03', balance: 150000 },
      { day: 4, date: '2026-11-04', balance: 700000 }
    ];

    it('marks the upcoming low with its amount and date', () => {
      const { container } = render(
        <StepLineChart dailyBalances={days} events={[]} safetyFloor={100000} currencySymbol="₹" currentDay={2}
          upcomingLow={{ balance: 150000, date: '2026-11-03' }} />
      );
      expect(container.querySelector('.bc-low text')).toHaveTextContent('Low ₹1,500 · Nov 3');
      expect(screen.getByText('Lowest from today')).toBeInTheDocument();
    });

    it('names the shortfall when the low is under the floor and draws the breach band', () => {
      const { container } = render(
        <StepLineChart dailyBalances={days} events={[]} safetyFloor={200000} currencySymbol="₹" currentDay={2}
          upcomingLow={{ balance: 150000, date: '2026-11-03' }} />
      );
      expect(container.querySelector('.bc-low.under text')).toHaveTextContent('₹500 under floor · Nov 3');
      expect(container.querySelectorAll('.bc-breach-band')).toHaveLength(1);
    });

    it('draws one marker per day with entries, with a count for several', () => {
      const evts = [
        { day: 1, date: '2026-11-01', amount: 900000, itemType: 'salary', isSalary: true, isActual: true },
        { day: 2, date: '2026-11-02', amount: -200000, isActual: true, label: 'A' },
        { day: 2, date: '2026-11-02', amount: -300000, isActual: true, label: 'B' },
        { day: 4, date: '2026-11-04', amount: -50000, isActual: false, isPlannedTransaction: true, label: 'Bill' }
      ];
      const { container } = render(<StepLineChart dailyBalances={days} events={evts} safetyFloor={0} currencySymbol="₹" />);
      expect(container.querySelectorAll('.bc-marker-income')).toHaveLength(1);
      expect(container.querySelectorAll('.bc-marker-paid')).toHaveLength(1);
      expect(container.querySelectorAll('.bc-marker-bill')).toHaveLength(1);
      expect(container.querySelector('.bc-marker-paid .bc-count')).toHaveTextContent('2');
    });
  });

  describe('Keyboard, hover and table', () => {
    it('moves through days with the arrow keys, selects with Enter and clears with Escape', () => {
      const onSelectDay = vi.fn();
      const { container } = render(
        <StepLineChart dailyBalances={mockDailyBalances} events={mockEvents} safetyFloor={1000} currencySymbol="₹" currentDay={2} onSelectDay={onSelectDay} />
      );
      const plot = container.querySelector('.chart-container');
      expect(plot).toHaveAttribute('tabindex', '0');

      fireEvent.keyDown(plot, { key: 'ArrowRight' });
      expect(container.querySelector('.di-date')).toHaveTextContent('Oct 3');
      fireEvent.keyDown(plot, { key: 'End' });
      expect(container.querySelector('.di-date')).toHaveTextContent('Oct 5');
      fireEvent.keyDown(plot, { key: 'Home' });
      expect(container.querySelector('.di-date')).toHaveTextContent('Oct 1');
      fireEvent.keyDown(plot, { key: 'Enter' });
      expect(onSelectDay).toHaveBeenLastCalledWith(1);
      fireEvent.keyDown(plot, { key: 'Escape' });
      expect(onSelectDay).toHaveBeenLastCalledWith(null);
    });

    it('shows a compact tooltip on pointer hover: date, balance and change', () => {
      const { container } = render(
        <StepLineChart dailyBalances={mockDailyBalances} events={mockEvents} safetyFloor={1000} currencySymbol="₹" />
      );
      const plot = container.querySelector('.chart-container');
      vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300 });
      fireEvent.mouseMove(plot, { clientX: 599, clientY: 100 });
      const tip = container.querySelector('.chart-tooltip');
      expect(tip).toHaveTextContent('Oct 5');
      expect(tip).toHaveTextContent('₹28.00');
      expect(tip).toHaveTextContent('−₹4.00');
      // At the right edge it pins to the card edge, above or below the point, never beside it
      expect(tip).toHaveClass('ct-end');
      expect(tip.className).toMatch(/ct-(above|below)/);
      fireEvent.mouseLeave(plot);
      expect(container.querySelector('.chart-tooltip')).toBeNull();
    });

    it('shows the numbers as a table on request', () => {
      render(<StepLineChart dailyBalances={mockDailyBalances} events={mockEvents} safetyFloor={3000} currencySymbol="₹" />);
      fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(mockDailyBalances.length + 1);
      expect(within(rows[2]).getByText('₹45.00')).toBeInTheDocument();
      expect(within(rows[2]).getByText('-₹5.00')).toBeInTheDocument();
      expect(within(rows[5]).getByText('₹2.00 under')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Hide table' }));
      expect(screen.queryByRole('table')).toBeNull();
    });
  });

  describe('formatChartTick (Y-axis label formatting)', () => {
    it('formats numbers under 10k as plain whole values with symbol (10, 100, 1000)', () => {
      // Input values are in minor units (paisa: 100 = 1 unit)
      expect(formatChartTick(0, '₹')).toBe('₹0');
      expect(formatChartTick(1000, '₹')).toBe('₹10');
      expect(formatChartTick(10000, '₹')).toBe('₹100');
      expect(formatChartTick(100000, '₹')).toBe('₹1,000');
      expect(formatChartTick(950000, '₹')).toBe('₹9,500');
    });

    it('formats thousands with "k" and lakhs with "L" (Indian system)', () => {
      expect(formatChartTick(1000000, '₹')).toBe('₹10k');
      expect(formatChartTick(5000000, '₹')).toBe('₹50k');
      expect(formatChartTick(10000000, '₹')).toBe('₹1L');
      expect(formatChartTick(15500000, '₹')).toBe('₹1.6L');
    });

    it('formats larger lakh values with "L" and crores with "Cr"', () => {
      expect(formatChartTick(100000000, '₹')).toBe('₹10L');
      expect(formatChartTick(250000000, '₹')).toBe('₹25L');
      expect(formatChartTick(1000000000, '₹')).toBe('₹1Cr');
      expect(formatChartTick(2550000000, '₹')).toBe('₹2.6Cr');
    });

    it('correctly handles negative values', () => {
      expect(formatChartTick(-2500000, '₹')).toBe('-₹25k');
      expect(formatChartTick(-50000, '₹')).toBe('-₹500');
    });
  });
});

describe('Details numbers count your own cash only', () => {
  // ₹10,000 in the bank, ₹4,000 of it held for someone; floor ₹8,000
  const held = [
    { day: 1, date: '2026-11-01', balance: 1000000, heldForOthers: 400000 },
    { day: 2, date: '2026-11-02', balance: 1000000, heldForOthers: 400000 }
  ];

  it('the low label, breach band and headroom leave out money held for others', () => {
    const { container } = render(
      <StepLineChart dailyBalances={held} events={[]} safetyFloor={800000} currencySymbol="₹" currentDay={1} selectedDay={1} />
    );
    // Own money is ₹6,000, ₹2,000 under the floor (the old label said "Low ₹10,000" with no breach)
    expect(container.querySelector('.bc-low.under text')).toHaveTextContent('₹2,000 under floor');
    expect(container.querySelectorAll('.bc-breach-band')).toHaveLength(1);
    expect(panel().getByText('-₹2,000.00')).toBeInTheDocument();
  });

  it('a card swipe moves no cash: not in Money out, and the day opens where it closes', () => {
    const days = [
      { day: 1, date: '2026-11-01', balance: 1000000 },
      { day: 2, date: '2026-11-02', balance: 1000000 }
    ];
    const swipe = { day: 1, date: '2026-11-01', amount: -200000, name: 'Swipe', isCardSpend: true, itemType: 'unplanned-transaction' };
    render(<StepLineChart dailyBalances={days} events={[swipe]} safetyFloor={0} currencySymbol="₹" selectedDay={1} />);
    expect(panel().getByText('Opened at ₹10,000.00')).toBeInTheDocument();
    expect(panel().getByText('-₹0.00')).toBeInTheDocument();
  });
});
