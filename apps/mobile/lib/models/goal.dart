import 'json_read.dart';

/// Goal statuses as the server sets them: created `logged`, `scheduled` once
/// it has a planned transaction, `deferred` by Defer and `active` again by
/// Reactivate (apps/server/src/domain/goalExecution.js), plus `achieved` and
/// `dropped` from CONTEXT.md. [unknown] keeps the app working if one is added.
enum GoalStatus { logged, active, scheduled, deferred, achieved, dropped, unknown }

/// Priority as the engine orders it: 0 is reserved first (ADR 0063).
enum GoalPriority {
  high(0, 'High'),
  medium(1, 'Medium'),
  low(2, 'Low');

  final int rank;
  final String label;
  const GoalPriority(this.rank, this.label);

  static GoalPriority fromRank(int? rank) =>
      GoalPriority.values.firstWhere((p) => p.rank == rank, orElse: () => GoalPriority.medium);
}

/// The engine's answer for when the goal can be bought safely this month.
class GoalRecommendation {
  final bool feasible;
  final int? recommendedDay;
  final String? recommendedDate;
  final String? explanation;
  final int? projectedFloorDeficit;
  final int? savingsBuffer;
  final String? lowestDate;

  const GoalRecommendation({
    required this.feasible,
    this.recommendedDay,
    this.recommendedDate,
    this.explanation,
    this.projectedFloorDeficit,
    this.savingsBuffer,
    this.lowestDate,
  });

  factory GoalRecommendation.fromJson(Object? source) {
    final r = JsonReader('GoalRecommendation', source);
    return GoalRecommendation(
      feasible: r.flag('feasible'),
      recommendedDay: r.optInt('recommendedDay'),
      recommendedDate: r.optDate('recommendedDate'),
      explanation: r.optString('explanation'),
      projectedFloorDeficit: r.optInt('projectedFloorDeficit'),
      savingsBuffer: r.optInt('savingsBuffer'),
      lowestDate: r.optDate('lowestDate'),
    );
  }
}

class Goal {
  final String id;
  final String name;
  final int targetAmount;
  final GoalStatus status;
  final GoalPriority priority;
  final String? targetDate;
  final String? fundingAccountId;

  /// Null when the engine did not evaluate the goal (e.g. a just-created
  /// `logged` goal): that is "not checked yet", never "not affordable".
  final GoalRecommendation? recommendation;
  final Map<String, dynamic> raw;

  const Goal({
    required this.id,
    required this.name,
    required this.targetAmount,
    required this.status,
    this.priority = GoalPriority.medium,
    this.targetDate,
    this.fundingAccountId,
    this.recommendation,
    this.raw = const {},
  });

  static const _statuses = {
    'logged': GoalStatus.logged,
    'active': GoalStatus.active,
    'scheduled': GoalStatus.scheduled,
    'deferred': GoalStatus.deferred,
    'achieved': GoalStatus.achieved,
    'dropped': GoalStatus.dropped,
  };

  factory Goal.fromJson(Object? source) {
    final r = JsonReader('Goal', source);
    final rec = r.json['recommendation'];
    return Goal(
      id: r.string('id', aliases: ['_id']),
      name: r.optString('name') ?? '',
      targetAmount: r.money('targetAmount'),
      status: _statuses[r.optString('status')] ?? GoalStatus.unknown,
      priority: GoalPriority.fromRank(r.optInt('priority')),
      targetDate: r.optDate('targetDate'),
      fundingAccountId: r.optString('fundingAccountId'),
      recommendation: rec == null ? null : GoalRecommendation.fromJson(rec),
      raw: r.json,
    );
  }

  bool get isDeferred => status == GoalStatus.deferred;

  /// Finished goals offer no actions besides delete.
  bool get isClosed => status == GoalStatus.achieved || status == GoalStatus.dropped;

  /// "Schedule" only for an open goal the engine found a safe day for.
  bool get canSchedule =>
      !isClosed && !isDeferred && status != GoalStatus.scheduled && (recommendation?.feasible ?? false);
}
