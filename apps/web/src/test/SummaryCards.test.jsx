import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SafeVelocityCard, DetailedKpiGrid } from '../components/SummaryCards.jsx';

describe('SummaryCards components', () => {
  describe('SafeVelocityCard', () => {
    it('renders safe velocity hero metric and days remaining', () => {
      render(
        <SafeVelocityCard
          safeVelocity={{
            safeVelocityPerDay: 45000,
            paceStatus: 'ON TRACK',
            daysLeft: 12,
            committedUpcomingItems: 500000,
            burnRatePerDay: 30000
          }}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Dynamic Safe Velocity')).toBeInTheDocument();
      expect(screen.getByText('ON TRACK')).toBeInTheDocument();
      expect(screen.getByText('12 days left')).toBeInTheDocument();
      expect(screen.getByText('₹450.00')).toBeInTheDocument();
      expect(screen.getByText(/Committed bills:/i)).toBeInTheDocument();
    });
  });

  describe('DetailedKpiGrid', () => {
    it('renders income, expenses, today balance, and lowest balance', () => {
      const mockEvents = [
        { day: 5, amount: -150000 },
        { day: 10, amount: -250000 }
      ];

      render(
        <DetailedKpiGrid
          incomeAmount={6000000}
          incomeCreditDay={1}
          events={mockEvents}
          endingBalance={4500000}
          todayBalance={4800000}
          lowestBalance={4200000}
          lowestDate="2026-10-10"
          safetyFloor={1000000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('Monthly income')).toBeInTheDocument();
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument();
      expect(screen.getByText('Total expenses')).toBeInTheDocument();
      expect(screen.getByText('₹4,000.00')).toBeInTheDocument();
      expect(screen.getByText('Today\'s balance')).toBeInTheDocument();
      expect(screen.getByText('₹48,000.00')).toBeInTheDocument();
      expect(screen.getByText('Lowest balance')).toBeInTheDocument();
      expect(screen.getByText('₹42,000.00')).toBeInTheDocument();
      expect(screen.queryByText('▲ BREACH')).not.toBeInTheDocument();
    });

    it('renders breach badge when lowest balance is lower than safety floor', () => {
      render(
        <DetailedKpiGrid
          incomeAmount={30000}
          lowestBalance={500}
          safetyFloor={1000}
          currencySymbol="₹"
        />
      );

      expect(screen.getByText('▲ BREACH')).toBeInTheDocument();
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

      expect(screen.getByText('✓ Credited')).toBeInTheDocument();
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
      expect(screen.getByText('✓ Credited')).toBeInTheDocument();
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

      expect(screen.queryByText('✓ Credited')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Edit salary credited date')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit date')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/mark salary as credited/i)).not.toBeInTheDocument();
    });
  });
});
