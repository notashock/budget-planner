import 'calendar.dart';
import 'simulator.dart';

class RecommendationResult {
  final String? recommendedDate;
  final int? recommendedDay;
  final bool feasible;
  final int projectedLowestBalance;
  final int savingsBuffer;
  final int? projectedFloorDeficit;
  final String explanation;

  RecommendationResult({
    this.recommendedDate,
    this.recommendedDay,
    required this.feasible,
    required this.projectedLowestBalance,
    required this.savingsBuffer,
    this.projectedFloorDeficit,
    required this.explanation,
  });

  Map<String, dynamic> toMap() => {
    'recommendedDate': recommendedDate,
    'recommendedDay': recommendedDay,
    'feasible': feasible,
    'projectedLowestBalance': projectedLowestBalance,
    'savingsBuffer': savingsBuffer,
    'projectedFloorDeficit': projectedFloorDeficit,
    'explanation': explanation,
  };

  factory RecommendationResult.fromJson(Map<String, dynamic> json) {
    return RecommendationResult(
      recommendedDate: json['recommendedDate']?.toString(),
      recommendedDay: (num.tryParse('${json['recommendedDay']}') ?? 1).toInt(),
      feasible: json['feasible'] == true,
      projectedLowestBalance: (num.tryParse('${json['projectedLowestBalance']}') ?? 0).round(),
      savingsBuffer: (num.tryParse('${json['savingsBuffer']}') ?? 0).round(),
      projectedFloorDeficit: json['projectedFloorDeficit'] != null
          ? (num.tryParse('${json['projectedFloorDeficit']}') ?? 0).round()
          : null,
      explanation: json['explanation']?.toString() ?? '',
    );
  }
}

/// Dynamic purchase goal date recommender port from recommender.js
RecommendationResult recommendPurchaseDate({
  Map<String, dynamic> settings = const {},
  List<dynamic> items = const [],
  Map<String, dynamic> month = const {'year': 2026, 'month': 1},
  num purchaseAmount = 0,
  List<dynamic> transactions = const [],
  List<dynamic> goals = const [],
  List<dynamic> transfers = const [],
  Map<String, dynamic>? fundingSource,
}) {
  final int year = (month['year'] as num?)?.toInt() ?? 2026;
  final int monthNum = (month['month'] as num?)?.toInt() ?? 1;
  final int daysInMonth = getDaysInMonth(year, monthNum);
  final int safetyFloor = ((settings['safetyFloor'] ?? month['safetyFloor'] ?? 0) as num).round();
  final int cost = purchaseAmount.abs().round();

  // Step 1: Candidate date window restricted strictly to future/today
  int currentDay = 1;
  int candidateStartDay = 1;
  final now = DateTime.now().toUtc();

  if (settings['currentDay'] != null) {
    currentDay = (settings['currentDay'] as num).toInt();
    candidateStartDay = currentDay >= 1 ? currentDay + 1 : 1;
  } else if (now.year == year && now.month == monthNum) {
    currentDay = now.day;
    candidateStartDay = currentDay + 1;
  }

  if (candidateStartDay > daysInMonth) {
    return RecommendationResult(
      recommendedDate: null,
      recommendedDay: null,
      feasible: false,
      projectedLowestBalance: 0,
      savingsBuffer: 0,
      projectedFloorDeficit: cost,
      explanation: 'No remaining candidate days in the current month. Defer to next month.',
    );
  }

  // Iterate candidate days to find the earliest/best day that maintains floor
  int? bestDay;
  int bestBuffer = -1;
  int bestLowestBal = -1;

  for (int day = candidateStartDay; day <= daysInMonth; day++) {
    // Clone items and insert synthetic candidate purchase item on this day
    final candidateItems = List.from(items)
      ..add({
        'id': 'candidate_goal_test',
        'type': 'one-time',
        'name': 'Goal Test',
        'amount': cost,
        'day': day,
        'date': formatDate(year, monthNum, day),
        'isPaid': false,
      });

    final sim = simulate(
      settings: settings,
      items: candidateItems,
      month: month,
      transactions: transactions,
      goals: goals,
      transfers: transfers,
      accounts: settings['accounts'] is List ? settings['accounts'] as List : const [],
    );

    if (sim.lowestBalance >= safetyFloor) {
      final buffer = sim.lowestBalance - safetyFloor;
      if (bestDay == null || buffer > bestBuffer) {
        bestDay = day;
        bestBuffer = buffer;
        bestLowestBal = sim.lowestBalance;
      }
    }
  }

  if (bestDay != null) {
    final dateStr = formatDate(year, monthNum, bestDay);
    return RecommendationResult(
      recommendedDate: dateStr,
      recommendedDay: bestDay,
      feasible: true,
      projectedLowestBalance: bestLowestBal,
      savingsBuffer: bestBuffer,
      explanation: 'Recommended on Day $bestDay ($dateStr) with safety buffer intact.',
    );
  }

  return RecommendationResult(
    recommendedDate: null,
    recommendedDay: null,
    feasible: false,
    projectedLowestBalance: 0,
    savingsBuffer: 0,
    projectedFloorDeficit: cost,
    explanation: 'Purchasing this goal would breach your safety floor this month. Consider deferring.',
  );
}

/// Evaluates goals sequentially, reserving funds for feasible goals
List<Map<String, dynamic>> evaluateGoalsWithReservation({
  Map<String, dynamic> settings = const {},
  List<dynamic> items = const [],
  Map<String, dynamic> month = const {'year': 2026, 'month': 1},
  List<dynamic> goals = const [],
  List<dynamic> transactions = const [],
  List<dynamic> transfers = const [],
  List<dynamic> accounts = const [],
}) {
  final List<dynamic> committedItems = List.from(items);
  final List<Map<String, dynamic>> evaluated = [];

  // Sort goals by priority (0 = High, 1 = Med, 2 = Low)
  final sortedGoals = List<Map<String, dynamic>>.from(
    goals.map((g) => g is Map<String, dynamic> ? Map<String, dynamic>.from(g) : <String, dynamic>{})
  );
  sortedGoals.sort((a, b) {
    final pA = (a['priority'] as num?)?.toInt() ?? 0;
    final pB = (b['priority'] as num?)?.toInt() ?? 0;
    return pA.compareTo(pB);
  });

  for (var g in sortedGoals) {
    final targetAmount = (g['targetAmount'] as num?) ?? 0;
    final status = g['status']?.toString() ?? 'active';

    if (status != 'active' && status != 'evaluating' && status != 'ready' && status != 'scheduled') {
      evaluated.add(g);
      continue;
    }

    final rec = recommendPurchaseDate(
      settings: settings,
      items: committedItems,
      month: month,
      purchaseAmount: targetAmount,
      transactions: transactions,
      goals: const [],
      transfers: transfers,
    );

    if (rec.feasible && rec.recommendedDay != null) {
      committedItems.add({
        'id': 'res_${g['_id'] ?? g['id'] ?? committedItems.length}',
        'type': 'one-time',
        'name': '[Goal Reserved] ${g['name']}',
        'amount': targetAmount,
        'day': rec.recommendedDay,
        'date': rec.recommendedDate,
        'isPaid': false,
      });
    }

    final copy = Map<String, dynamic>.from(g);
    copy['recommendation'] = rec.toMap();
    evaluated.add(copy);
  }

  return evaluated;
}
