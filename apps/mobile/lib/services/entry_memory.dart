import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Remembered entry defaults on this device: the last account used for each
/// kind of entry and the category last used for a description. A convenience
/// only: if storage fails, the entry sheet behaves as before.
///
/// Mirrors apps/web/src/utils/entryMemory.js.
class EntryMemory {
  static const _key = 'bp.entryMemory.v1';
  static const _maxDescriptions = 200;
  static EntryMemory? _cache;

  final Map<String, dynamic> _data;
  EntryMemory._(this._data);

  static Future<EntryMemory> load() async {
    if (_cache != null) return _cache!;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      _cache = EntryMemory._(raw == null ? {} : Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      _cache = EntryMemory._({});
    }
    return _cache!;
  }

  @visibleForTesting
  static void resetForTest([Map<String, dynamic>? data]) {
    _cache = data == null ? null : EntryMemory._(data);
  }

  static String descriptionKey(String description) =>
      description.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

  /// Last account for a mode ('transaction', 'income', 'item', 'transfer'): {accountType, accountId}.
  Map<String, String>? accountFor(String mode) {
    final accounts = _data['accounts'];
    if (accounts is! Map || accounts[mode] is! Map) return null;
    final entry = Map<String, dynamic>.from(accounts[mode] as Map);
    final id = entry['accountId']?.toString();
    if (id == null || id.isEmpty) return null;
    return {'accountType': entry['accountType']?.toString() ?? 'bank', 'accountId': id};
  }

  Future<void> rememberAccount(String mode, String accountType, String? accountId) async {
    if (accountId == null || accountId.isEmpty) return;
    final accounts = Map<String, dynamic>.from((_data['accounts'] as Map?) ?? {});
    accounts[mode] = {'accountType': accountType, 'accountId': accountId};
    _data['accounts'] = accounts;
    await _save();
  }

  String? categoryFor(String description) {
    final key = descriptionKey(description);
    final categories = _data['categories'];
    if (key.isEmpty || categories is! Map) return null;
    return categories[key]?.toString();
  }

  Future<void> rememberCategory(String description, String category) async {
    final key = descriptionKey(description);
    if (key.isEmpty || category.isEmpty) return;
    final categories = Map<String, dynamic>.from((_data['categories'] as Map?) ?? {});
    categories.remove(key);
    categories[key] = category;
    while (categories.length > _maxDescriptions) {
      categories.remove(categories.keys.first);
    }
    _data['categories'] = categories;
    await _save();
  }

  Future<void> _save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(_data));
    } catch (_) {
      // Storage unavailable: nothing to remember
    }
  }
}
