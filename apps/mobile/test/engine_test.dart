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

  group('Simulation Tests', () {
    test('simulate calculates running balance and floor breaches accurately', () {
      final sim = simulate(
        settings: {
          'openingBalance': 100000, // ₹1,000
          'incomeAmount': 500000,  // ₹5,000
          'incomeCreditDay': 1,
          'safetyFloor': 200000,   // ₹2,000
        },
        items: [
          {
            'name': 'Rent',
            'amount': 450000, // ₹4,500
            'day': 5,
            'type': 'one-time',
            'isPaid': false,
          }
        ],
        month: {'year': 2026, 'month': 10},
      );

      // On day 1: 100,000 + 500,000 = 600,000 (₹6,000)
      // On day 5: 600,000 - 450,000 = 150,000 (₹1,500)
      // 150,000 < 200,000 safety floor -> breach!
      expect(sim.lowestBalance, 150000);
      expect(sim.lowestBalanceDay, 5);
      expect(sim.breaches.isNotEmpty, true);
      expect(sim.breaches.first.deficit, 50000); // 200,000 - 150,000 = 50,000
    });
  });
}
