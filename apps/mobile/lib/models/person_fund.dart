import 'json_read.dart';

/// CONTEXT.md "Person Fund (Held & Lent)".
enum FundDirection { held, lent }

enum FundStatus { open, settled }

class PersonFund {
  final String id;
  final String personName;
  final FundDirection direction;
  final FundStatus status;

  /// Still to give back (held) or still owed to the user (lent), minor units.
  final int outstanding;
  final String? expectedSettleDate;
  final String? lastActivityDate;
  final Map<String, dynamic> raw;

  const PersonFund({
    required this.id,
    required this.personName,
    required this.direction,
    required this.status,
    required this.outstanding,
    this.expectedSettleDate,
    this.lastActivityDate,
    this.raw = const {},
  });

  factory PersonFund.fromJson(Object? source) {
    final r = JsonReader('PersonFund', source);
    final dir = r.string('direction');
    final st = r.optString('status') ?? 'open';
    return PersonFund(
      id: r.string('id', aliases: ['_id']),
      personName: r.string('personName'),
      direction: switch (dir) {
        'held' => FundDirection.held,
        'lent' => FundDirection.lent,
        _ => throw ModelParseException(
          'PersonFund',
          'direction',
          dir,
          'is not held or lent',
        ),
      },
      status: st == 'settled' ? FundStatus.settled : FundStatus.open,
      outstanding: r.optMoney('outstanding') ?? 0,
      expectedSettleDate: r.optDate('expectedSettleDate'),
      lastActivityDate: r.optDate('lastActivityDate'),
      raw: r.json,
    );
  }
}

/// GET /api/v1/person-funds: the funds and what is held / lent in total.
class PersonFunds {
  final List<PersonFund> funds;
  final int totalHeld;
  final int totalLent;

  const PersonFunds({
    required this.funds,
    required this.totalHeld,
    required this.totalLent,
  });

  factory PersonFunds.fromJson(Object? source) {
    final r = JsonReader('PersonFunds', source);
    final totals = JsonReader(
      'PersonFunds.totals',
      r.json['totals'] ?? const <String, dynamic>{},
    );
    return PersonFunds(
      funds: r.list('funds', PersonFund.fromJson),
      totalHeld: totals.optMoney('held') ?? 0,
      totalLent: totals.optMoney('lent') ?? 0,
    );
  }
}
