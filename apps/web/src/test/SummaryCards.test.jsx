import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { MonthHealthHero } from '../components/MonthHealthHero.jsx';

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

    it('renders the daily safe-to-spend figure, days left and an On track verdict', () => {
      render(
        <MonthHealthHero
          safeVelocity={baseVelocity}
          todayBalance={2040000}
          endingBalance={1800000}
          lowestBalance={1600000}
          lowestDate="2026-11-28"
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Safe to spend')).toBeInTheDocument();
      expect(screen.getByText('₹450')).toBeInTheDocument();
      expect(screen.getByText('12 days left')).toBeInTheDocument();
      expect(screen.getByText('On track')).toBeInTheDocument();
      expect(screen.getByText(/of upcoming bills, your/i)).toBeInTheDocument();
    });

    it("shows where today's balance goes with legend amounts that add up", () => {
      render(
        <MonthHealthHero
          safeVelocity={baseVelocity}
          todayBalance={2040000}
          lowestBalance={1600000}
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText("Where today's balance goes")).toBeInTheDocument();
      // 20,400 = 5,000 bills + 10,000 floor + 5,400 free
      expect(screen.getByText('Upcoming bills')).toBeInTheDocument();
      expect(screen.getByText('₹5,000')).toBeInTheDocument();
      expect(screen.getByText('Safety floor')).toBeInTheDocument();
      expect(screen.getByText('Free to spend')).toBeInTheDocument();
      expect(screen.getByText('₹5,400')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Today's balance split/i })).toBeInTheDocument();
    });

    it('flags a projected floor breach with a Below floor verdict and a shortfall part', () => {
      render(
        <MonthHealthHero
          safeVelocity={{ ...baseVelocity, safeVelocityPerDay: 0, freeSurplus: 0 }}
          todayBalance={1200000}
          lowestBalance={600000}
          lowestDate="2026-11-25"
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Below floor')).toBeInTheDocument();
      expect(screen.getByText(/under your safety floor/i)).toBeInTheDocument();
      expect(screen.getByText('Shortfall')).toBeInTheDocument();
    });

    it("sets aside this month's goal share as its own part of the bar and names it in the explanation", () => {
      render(
        <MonthHealthHero
          safeVelocity={{ ...baseVelocity, goalReserve: 200000, freeSurplus: 340000 }}
          todayBalance={2040000}
          lowestBalance={1600000}
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      // 20,400 = 5,000 bills + 10,000 floor + 2,000 goals + 3,400 free
      expect(screen.getByText('Goal savings')).toBeInTheDocument();
      expect(screen.getByText('₹2,000')).toBeInTheDocument();
      expect(screen.getByText('₹3,400')).toBeInTheDocument();
      expect(screen.getByText(/set aside for goals this month/i)).toBeInTheDocument();
    });

    it('calls a month tight when the low point is within 15% of the floor', () => {
      render(
        <MonthHealthHero
          safeVelocity={baseVelocity}
          todayBalance={2040000}
          lowestBalance={1100000}
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Tight month')).toBeInTheDocument();
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
