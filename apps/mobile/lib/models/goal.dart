import 'json_read.dart';

/// CONTEXT.md "Goal". [unknown] keeps the app working if the server adds a status.
enum GoalStatus { logged, scheduled, achieved, dropped, unknown }

class Goal {
  final String id;
  final String name;
  final int targetAmount;
  final GoalStatus status;
  final int? priority;
  final String? targetDate;
  final String? fundingAccountId;
  final Map<String, dynamic> raw;

  const Goal({
    required this.id,
    required this.name,
    required this.targetAmount,
    required this.status,
    this.priority,
    this.targetDate,
    this.fundingAccountId,
    this.raw = const {},
  });

  static const _statuses = {
    'logged': GoalStatus.logged,
    'scheduled': GoalStatus.scheduled,
    'achieved': GoalStatus.achieved,
    'dropped': GoalStatus.dropped,
  };

  factory Goal.fromJson(Object? source) {
    final r = JsonReader('Goal', source);
    return Goal(
      id: r.string('id', aliases: ['_id']),
      name: r.optString('name') ?? '',
      targetAmount: r.money('targetAmount'),
      status: _statuses[r.optString('status')] ?? GoalStatus.unknown,
      priority: r.optInt('priority'),
      targetDate: r.optDate('targetDate'),
      fundingAccountId: r.optString('fundingAccountId'),
      raw: r.json,
    );
  }
}
