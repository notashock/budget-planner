import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { MonthHealthHero } from '../components/MonthHealthHero.jsx';
import { CashAllocationBar } from '../components/CashAllocationBar.jsx';

describe('SummaryCards components', () => {
  describe('MonthHealthHero', () => {
    const baseVelocity = {
      safeVelocityPerDay: 45000,
      paceStatus: 'stable',
      daysLeft: 12,
      committedUpcomingItems: 500000,
      burnRatePerDay: 30000,
      freeSurplus: 540000
    };

    it('shows one number and one caption line, with no explanation paragraph', () => {
      const { container } = render(
        <MonthHealthHero safeVelocity={baseVelocity} lowestBalance={1600000} safetyFloor={1000000} currencySymbol="₹" />
      );

      expect(screen.getByText('₹450')).toBeInTheDocument();
      expect(screen.getByText(/safe to spend today · 12 days left/)).toBeInTheDocument();
      expect(container.querySelector('.mh-dot.verdict-good')).not.toBeNull();
      expect(screen.queryByText(/of upcoming bills/i)).not.toBeInTheDocument();
      expect(container.textContent.split(/s+/).filter(Boolean).length).toBeLessThanOrEqual(10);
    });

    it('opens the details on tap and says so to screen readers', () => {
      const onToggle = vi.fn();
      render(
        <MonthHealthHero safeVelocity={baseVelocity} lowestBalance={1600000} safetyFloor={1000000}
          currencySymbol="₹" onToggleDetails={onToggle} detailsOpen={false} />
      );

      const hero = screen.getByRole('button', { name: /₹450 safe to spend today, On track, 12 days left. Show details/ });
      expect(hero).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(hero);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('draws a sparkline with today marked', () => {
      const dailyBalances = [5000, 4000, 4500, 3000].map((balance, i) => ({ day: i + 1, balance }));
      const { container } = render(
        <MonthHealthHero safeVelocity={baseVelocity} dailyBalances={dailyBalances} currentDay={2} currencySymbol="₹" />
      );

      expect(container.querySelector('.mh-spark-plan').getAttribute('points').split(' ')).toHaveLength(4);
      expect(container.querySelector('.mh-spark-past').getAttribute('points').split(' ')).toHaveLength(2);
      expect(container.querySelector('.mh-spark-dot')).not.toBeNull();
    });

    it('marks a projected floor breach and a tight month by colour and in the label', () => {
      const { container, rerender } = render(
        <MonthHealthHero safeVelocity={{ ...baseVelocity, safeVelocityPerDay: 0 }} lowestBalance={600000}
          safetyFloor={1000000} currencySymbol="₹" onToggleDetails={() => {}} />
      );
      expect(container.querySelector('.mh-dot.verdict-critical')).not.toBeNull();
      expect(screen.getByRole('button', { name: /Below floor/ })).toBeInTheDocument();

      rerender(
        <MonthHealthHero safeVelocity={baseVelocity} lowestBalance={1100000} safetyFloor={1000000}
          currencySymbol="₹" onToggleDetails={() => {}} />
      );
      expect(container.querySelector('.mh-dot.verdict-tight')).not.toBeNull();
      expect(screen.getByRole('button', { name: /Tight month/ })).toBeInTheDocument();
    });
  });

  describe('CashAllocationBar (in the Plan details)', () => {
    it("shows where today's balance goes with legend amounts that add up", () => {
      render(
        <CashAllocationBar todayBalance={2040000} committedUpcomingItems={500000} safetyFloor={1000000}
          freeSurplus={540000} currencySymbol="₹" />
      );

      expect(screen.getByText("After today's bills")).toBeInTheDocument();
      // 20,400 = 5,000 bills + 10,000 kept aside + 5,400 free
      expect(screen.getByText('Upcoming bills')).toBeInTheDocument();
      expect(screen.getByText('₹5,000')).toBeInTheDocument();
      expect(screen.getByText('Keep at least')).toBeInTheDocument();
      expect(screen.getByText('Free to spend')).toBeInTheDocument();
      expect(screen.getByText('₹5,400')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Today's balance split/i })).toBeInTheDocument();
    });

    it('shows a shortfall part when bills and the minimum exceed the balance', () => {
      render(
        <CashAllocationBar todayBalance={1200000} committedUpcomingItems={500000} safetyFloor={1000000}
          freeSurplus={0} currencySymbol="₹" />
      );
      expect(screen.getByText('Shortfall')).toBeInTheDocument();
    });

    it("sets aside this month's goal share as its own part of the bar", () => {
      render(
        <CashAllocationBar todayBalance={2040000} committedUpcomingItems={500000} safetyFloor={1000000}
          goalReserve={200000} freeSurplus={340000} currencySymbol="₹" />
      );

      // 20,400 = 5,000 bills + 10,000 kept aside + 2,000 goals + 3,400 free
      expect(screen.getByText('Goal savings')).toBeInTheDocument();
      expect(screen.getByText('₹2,000')).toBeInTheDocument();
      expect(screen.getByText('₹3,400')).toBeInTheDocument();
    });
  });

  describe('DetailedKpiGrid', () => {
    it('renders income, expenses with paid/planned split, net with savings rate, and lowest balance headroom', () => {
      const mockEvents = [
        { day: 5, amount: -150000, isActual: true },
        { day: 10, amount: -250000 },
        { day: 12, amount: -90000, itemType: 'transfer' }
      ];

      render(
        <DetailedKpiGrid
          incomeAmount={6000000}
          incomeCreditDay={1}
          events={mockEvents}
          lowestBalance={4200000}
          lowestDate="2026-10-10"
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Monthly income')).toBeInTheDocument();
      expect(screen.getByText('₹60,000')).toBeInTheDocument();
      expect(screen.getByText('Total expenses')).toBeInTheDocument();
      expect(screen.getByText('₹4,000')).toBeInTheDocument();
      expect(screen.getByText(/₹1,500.00 paid · ₹2,500.00 planned/)).toBeInTheDocument();
      expect(screen.getByText('Projected net')).toBeInTheDocument();
      expect(screen.getByText('+₹56,000')).toBeInTheDocument();
      expect(screen.getByText('93% of income saved')).toBeInTheDocument();
      expect(screen.getByText('Lowest balance')).toBeInTheDocument();
      expect(screen.getByText('₹42,000')).toBeInTheDocument();
      expect(screen.getByText(/₹32,000.00 above floor/)).toBeInTheDocument();
      expect(screen.queryByText('Below floor')).not.toBeInTheDocument();
    });

    it("counts SIPs and goal contributions as saving, not spending", () => {
      render(
        <DetailedKpiGrid
          incomeAmount={10000000}
          events={[
            { amount: -5000000, category: 'Rent', isActual: true },
            { amount: -1500000, category: 'Investments', tag: 'SIP' },
            { amount: -500000, origin: 'goal', category: 'Phone' }
          ]}
          lowestBalance={3000000}
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );
      // Income 1,00,000 - outflows 70,000 = 30,000 left; + 20,000 invested = 50,000 → 50%
      expect(screen.getByText('+₹30,000')).toBeInTheDocument();
      expect(screen.getByText('₹50,000 saved & invested · 50% of income')).toBeInTheDocument();
    });

    it("flags a breach earlier this month even when the upcoming low is above the floor", () => {
      render(
        <DetailedKpiGrid
          incomeAmount={100000}
          lowestBalance={300000}
          lowestDate="2026-10-20"
          pastBreach={{ balance: -20000, date: '2026-10-03' }}
          safetyFloor={100000}
          currencySymbol="₹"
        />
      );
      expect(screen.queryByText('Below floor')).not.toBeInTheDocument();
      expect(screen.getByText(/Dipped below on Oct 3/)).toBeInTheDocument();
    });

    it('renders a below-floor badge and a negative net when spending exceeds income', () => {
      render(
        <DetailedKpiGrid
          incomeAmount={30000}
          totalExpenses={45000}
          lowestBalance={500}
          safetyFloor={1000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Below floor')).toBeInTheDocument();
      expect(screen.getByText(/₹5.00 under floor/)).toBeInTheDocument();
      expect(screen.getByText('-₹150')).toBeInTheDocument();
      expect(screen.getByText('Spending 50% more than income')).toBeInTheDocument();
    });

    it('renders credited badge and date subtext when salary is credited', () => {
      const mockMonth = { year: 2026, month: 10, incomeCreditDay: 1 };

      render(
        <DetailedKpiGrid
          incomeAmount={5000000}
          incomeCreditDay={1}
          currencySymbol="₹"
          isSalaryCredited={true}
          salaryCreditedDate="2026-10-01"
          month={mockMonth}
          canEditSalary={true}
        />
      );

      expect(screen.getByText('Credited')).toBeInTheDocument();
      expect(screen.getByText(/Credited on/i)).toBeInTheDocument();
      expect(screen.queryByTitle('Edit salary credited date')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit date')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/mark salary as credited/i)).not.toBeInTheDocument();
    });

    it('treats previous month salary credited date as credited', () => {
      const mockMonth = { year: 2026, month: 10, incomeCreditDay: 1 };

      render(
        <DetailedKpiGrid
          incomeAmount={5000000}
          incomeCreditDay={1}
          currencySymbol="₹"
          isSalaryCredited={false}
          salaryCreditedDate="2026-09-30"
          month={mockMonth}
          canEditSalary={true}
        />
      );

      // Previous month date is automatically treated as credited
      expect(screen.getByText('Credited')).toBeInTheDocument();
      expect(screen.getByText(/Credited on/i)).toBeInTheDocument();
      expect(screen.queryByTitle('Edit salary credited date')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit date')).not.toBeInTheDocument();
    });

    it('hides edit button and credited tag when canEditSalary is false', () => {
      const mockMonth = { year: 2026, month: 10, incomeCreditDay: 1 };

      render(
        <DetailedKpiGrid
          incomeAmount={5000000}
          incomeCreditDay={1}
          currencySymbol="₹"
          isSalaryCredited={true}
          salaryCreditedDate="2026-10-01"
          month={mockMonth}
          canEditSalary={false}
        />
      );

      expect(screen.queryByText('Credited')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Edit salary credited date')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit date')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/mark salary as credited/i)).not.toBeInTheDocument();
    });
  });
});
