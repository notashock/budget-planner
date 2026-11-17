import 'package:flutter_test/flutter_test.dart';
import 'package:budget_mobile/engine/engine.dart';

void main() {
  group('Engine Calendar & Currency Tests', () {
    test('getDaysInMonth returns correct days', () {
      expect(getDaysInMonth(2026, 2), 28);
      expect(getDaysInMonth(2024, 2), 29); // leap year
      expect(getDaysInMonth(2026, 10), 31);
      expect(getDaysInMonth(2026, 4), 30);
    });

    test('formatCurrency handles INR formatting with minor units', () {
      expect(formatCurrency(100000, symbol: '₹'), '₹1,000.00');
      expect(formatCurrency(5050, symbol: '₹'), '₹50.50');
      expect(formatCurrency(-250000, symbol: '₹'), '-₹2,500.00');
    });

    test('formatCompactCurrency scales correctly', () {
      expect(formatCompactCurrency(50000, symbol: '₹'), '₹500');
      expect(formatCompactCurrency(1500000, symbol: '₹'), '₹15k');
      expect(formatCompactCurrency(100000000, symbol: '₹'), '₹1m');
    });
  });

  group('Server simulation parsing', () {
    test('SimulationResult.fromJson reads the server engine output', () {
      final sim = SimulationResult.fromJson({
        'openingBalance': 100000,
        'endingBalance': 150000,
        'lowestBalance': 150000,
        'lowestBalanceDay': 5,
        'incomeAmount': 500000,
        'totalExpenses': 450000,
        'totalActualExpenses': 0,
        'todayBalance': 600000,
        'dailyBalances': [
          {'day': 1, 'date': '2026-10-01', 'balance': 600000},
          {'day': 5, 'date': '2026-10-05', 'balance': 150000},
        ],
        'events': [
          {'date': '2026-10-05', 'day': 5, 'label': 'Rent', 'amount': -450000, 'balanceAfter': 150000, 'itemType': 'one-time'},
        ],
        'safeVelocity': {
          'safeVelocityPerDay': 2000,
          'daysLeft': 14,
          'freeSurplus': 28000,
          'paceStatus': 'stable',
          'committedUpcomingItems': 450000,
          'burnRatePerDay': 500,
        },
      });

      expect(sim.closingBalance, 150000);
      expect(sim.lowestBalance, 150000);
      expect(sim.lowestBalanceDay, 5);
      expect(sim.totalIncome, 500000);
      expect(sim.todaysBalance, 600000);
      expect(sim.days.length, 2);
      expect(sim.days[1].closingBalance, 150000);
      expect(sim.allEvents.single.name, 'Rent');
      expect(sim.allEvents.single.amount, -450000);
      expect(sim.safeVelocity.safeDailyAmount, 2000);
      expect(sim.safeVelocity.remainingDays, 14);
      expect(sim.safeVelocity.availableBudget, 28000);
      expect(sim.safeVelocity.committedUpcomingItems, 450000);
    });
  });
}
