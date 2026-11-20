import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// What a captured write does (ADR 0071). Only these are captured: everything
/// else waits for the server.
enum OutboxKind { spend, income, markPaid }

/// The result of a captured write for the screen that made it.
enum WriteResult {
  /// The server saved it.
  saved,

  /// Kept on the phone; it is sent when the server can be reached.
  queued,
}

/// A write saved on the phone before it is sent (ADR 0071). It is sent with
/// [key] as its Idempotency-Key every time, so a write that reached the server
/// before the connection dropped is never stored twice.
class OutboxEntry {
  final String key;
  final OutboxKind kind;

  /// POST path and body, exactly as they will be sent.
  final String path;
  final Map<String, dynamic> body;

  /// What the user sees while it waits: the name and a positive amount in minor units.
  final String label;
  final int amount;

  final DateTime createdAt;

  /// Id of the user who made it; other users never see or send it.
  final String owner;

  /// Why the server refused it on a background send. A refused entry is not
  /// sent again until the user retries it.
  final String? error;

  const OutboxEntry({
    required this.key,
    required this.kind,
    required this.path,
    required this.body,
    required this.label,
    required this.amount,
    required this.createdAt,
    required this.owner,
    this.error,
  });

  /// The server forgets idempotency keys after 7 days
  /// (apps/server/src/middleware/idempotency.js). After 6, a replay might
  /// duplicate a write that did arrive, so the user is asked first.
  static const Duration staleAfter = Duration(days: 6);

  bool isStale(DateTime now) => now.difference(createdAt) > staleAfter;

  OutboxEntry withError(String? message) => OutboxEntry(
        key: key,
        kind: kind,
        path: path,
        body: body,
        label: label,
        amount: amount,
        createdAt: createdAt,
        owner: owner,
        error: message,
      );

  Map<String, dynamic> toJson() => {
        'key': key,
        'kind': kind.name,
        'path': path,
        'body': body,
        'label': label,
        'amount': amount,
        'createdAt': createdAt.toIso8601String(),
        'owner': owner,
        'error': ?error,
      };

  static OutboxEntry fromJson(Map<String, dynamic> j) => OutboxEntry(
        key: j['key'] as String,
        kind: OutboxKind.values.byName(j['kind'] as String),
        path: j['path'] as String,
        body: Map<String, dynamic>.from(j['body'] as Map),
        label: j['label'] as String,
        amount: j['amount'] as int,
        createdAt: DateTime.parse(j['createdAt'] as String),
        owner: j['owner'] as String,
        error: j['error'] as String?,
      );
}

/// Device storage for [OutboxEntry]s of every user who signed in here. It is
/// not cleared on sign-out: a user's entries wait for that user.
class OutboxStore {
  static const String storageKey = 'budget_outbox_v1';

  static Future<List<OutboxEntry>> read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKey);
    if (raw == null) return [];
    final entries = <OutboxEntry>[];
    try {
      for (final e in jsonDecode(raw) as List) {
        try {
          entries.add(OutboxEntry.fromJson(Map<String, dynamic>.from(e as Map)));
        } catch (_) {
          // shortcut: an unreadable entry (from a newer or older app version) is
          // skipped, not deleted, until the next write rewrites the list.
        }
      }
    } on FormatException {
      return [];
    }
    return entries;
  }

  static Future<void> write(List<OutboxEntry> entries) async {
    final prefs = await SharedPreferences.getInstance();
    if (entries.isEmpty) {
      await prefs.remove(storageKey);
    } else {
      await prefs.setString(storageKey, jsonEncode([for (final e in entries) e.toJson()]));
    }
  }
}
