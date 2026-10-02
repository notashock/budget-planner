import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepLineChart } from '../components/StepLineChart.jsx';

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

  it('renders SVG chart with title, legend, and safety floor', () => {
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
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText(/Floor: ₹1,000.00/i)).toBeInTheDocument();
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
});
