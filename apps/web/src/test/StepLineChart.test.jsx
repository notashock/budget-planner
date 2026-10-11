import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('displays opening balance, day spending, and closing balance in tooltip on day selection', () => {
    render(
      <StepLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        safetyFloor={1000}
        currencySymbol="₹"
        selectedDay={2}
      />
    );

    // Day 2: 5000 paisa = ₹50.00, spending = -500 paisa = -₹5.00, closing = 4500 paisa = ₹45.00
    expect(screen.getByText('Opening:')).toBeInTheDocument();
    expect(screen.getByText('Spending:')).toBeInTheDocument();
    expect(screen.getByText('Closing:')).toBeInTheDocument();
    expect(screen.getByText('₹50.00')).toBeInTheDocument();
    expect(screen.getByText('-₹5.00')).toBeInTheDocument();
    expect(screen.getByText('₹45.00')).toBeInTheDocument();
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
