import 'json_read.dart';

/// Money moved between two of the user's own accounts (CONTEXT.md
/// "Transfer Transaction"), from GET /api/v1/transfers. The server sends
/// account ids only; names come from the accounts the app has loaded.
class Transfer {
  final String id;
  final String date;
  final int amount;
  final String sourceAccountId;
  final String destinationAccountId;
  final String note;
  final Map<String, dynamic> raw;

  const Transfer({
    required this.id,
    required this.date,
    required this.amount,
    required this.sourceAccountId,
    required this.destinationAccountId,
    this.note = '',
    this.raw = const {},
  });

  factory Transfer.fromJson(Object? source) {
    final r = JsonReader('Transfer', source);
    return Transfer(
      id: r.string('id', aliases: ['_id']),
      date: r.date('date'),
      amount: r.money('amount'),
      sourceAccountId: r.string('sourceAccountId', aliases: ['sourceId']),
      destinationAccountId: r.string('destinationAccountId', aliases: ['destinationId']),
      note: r.optString('note') ?? '',
      raw: r.json,
    );
  }

  /// Day of the month, from [date].
  int get day => int.parse(date.substring(8, 10));
}
