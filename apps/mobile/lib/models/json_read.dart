/// Strict readers for server JSON (docs/MOBILE_APP_UPGRADE_PLAN.md, 1.1).
///
/// A required field that is missing or has the wrong type throws
/// [ModelParseException]; BudgetProvider reports that as an unreadable
/// response instead of showing a guessed value. Optional fields return null.
/// Money is always an `int` in minor units (paise).
class ModelParseException implements FormatException {
  @override
  final String message;
  final String model;
  final String field;
  final Object? value;

  ModelParseException(this.model, this.field, this.value, String problem)
    : message =
          '$model.$field $problem (got ${value is String ? '"$value"' : value})';

  @override
  int? get offset => null;

  @override
  Object? get source => value;

  @override
  String toString() => 'ModelParseException: $message';
}

class JsonReader {
  final String model;
  final Map<String, dynamic> json;

  JsonReader(this.model, Object? raw) : json = _asMap(model, raw);

  static Map<String, dynamic> _asMap(String model, Object? raw) {
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) return Map<String, dynamic>.from(raw);
    throw ModelParseException(model, '(root)', raw, 'is not an object');
  }

  Object? _first(String key, List<String> aliases) {
    if (json[key] != null) return json[key];
    for (final a in aliases) {
      if (json[a] != null) return json[a];
    }
    return null;
  }

  String string(String key, {List<String> aliases = const []}) {
    final v = _first(key, aliases);
    if (v is String && v.isNotEmpty) return v;
    throw ModelParseException(model, key, v, 'must be a non-empty string');
  }

  String? optString(String key, {List<String> aliases = const []}) {
    final v = _first(key, aliases);
    if (v == null) return null;
    if (v is String) return v.isEmpty ? null : v;
    throw ModelParseException(model, key, v, 'must be a string');
  }

  /// Whole minor units. Accepts an integral `num` (JSON has no int/double split
  /// on some paths); rejects fractions and strings so a unit mistake is loud.
  int money(String key, {List<String> aliases = const []}) {
    final v = optMoney(key, aliases: aliases);
    if (v == null) throw ModelParseException(model, key, null, 'is required');
    return v;
  }

  int? optMoney(String key, {List<String> aliases = const []}) {
    final v = _first(key, aliases);
    if (v == null) return null;
    if (v is int) return v;
    if (v is num && v == v.roundToDouble()) return v.toInt();
    throw ModelParseException(
      model,
      key,
      v,
      'must be a whole number of minor units',
    );
  }

  int? optInt(String key, {List<String> aliases = const []}) =>
      optMoney(key, aliases: aliases);

  double? optDouble(String key) {
    final v = json[key];
    if (v == null) return null;
    if (v is num) return v.toDouble();
    throw ModelParseException(model, key, v, 'must be a number');
  }

  bool flag(String key, {bool orElse = false}) {
    final v = json[key];
    if (v == null) return orElse;
    if (v is bool) return v;
    throw ModelParseException(model, key, v, 'must be true or false');
  }

  /// A 'YYYY-MM-DD' calendar date.
  String date(String key, {List<String> aliases = const []}) {
    final v = optDate(key, aliases: aliases);
    if (v == null) throw ModelParseException(model, key, null, 'is required');
    return v;
  }

  static final RegExp _isoDate = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  String? optDate(String key, {List<String> aliases = const []}) {
    final v = _first(key, aliases);
    if (v == null) return null;
    if (v is String && _isoDate.hasMatch(v)) return v;
    throw ModelParseException(model, key, v, "must be a 'YYYY-MM-DD' date");
  }

  List<T> list<T>(String key, T Function(Object? item) parse) {
    final v = json[key];
    if (v == null) return const [];
    if (v is! List) throw ModelParseException(model, key, v, 'must be a list');
    return [for (final item in v) parse(item)];
  }
}
