/// Category suggested for a spend or planned bill from its description: what
/// the user picked last time for the same description, otherwise a keyword
/// match. Returns null when nothing fits.
///
/// Mirrors apps/web/src/utils/categorySuggest.js; keep the two lists in step.
const Map<String, List<String>> categoryKeywords = {
  'Food': [
    'grocery', 'groceries', 'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'tea', 'lunch', 'dinner',
    'breakfast', 'snack', 'snacks', 'milk', 'vegetable', 'vegetables', 'fruit', 'fruits', 'bakery', 'food',
    'pizza', 'burger', 'dominos', 'mcdonald', 'kfc', 'blinkit', 'zepto', 'bigbasket', 'instamart', 'dmart', 'meal',
  ],
  'Travel': [
    'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'irctc', 'flight', 'cab', 'taxi', 'auto', 'fuel',
    'petrol', 'diesel', 'parking', 'toll', 'fastag', 'travel', 'trip', 'airport', 'indigo', 'railway',
  ],
  'Utilities': [
    'electricity', 'power', 'water', 'gas', 'internet', 'broadband', 'wifi', 'recharge', 'mobile', 'phone',
    'dth', 'rent', 'maintenance', 'airtel', 'jio', 'bsnl', 'vodafone', 'bill', 'subscription', 'netflix', 'spotify',
  ],
  'Health': [
    'doctor', 'hospital', 'pharmacy', 'medicine', 'medicines', 'medical', 'clinic', 'apollo', 'dental', 'dentist',
    'lab', 'checkup', 'gym', 'health', 'chemist', 'physio', 'insurance',
  ],
};

String? suggestCategory(
  String description, {
  List<String>? allowed,
  String? Function(String description)? remembered,
}) {
  final fromMemory = remembered?.call(description);
  if (fromMemory != null && (allowed == null || allowed.contains(fromMemory))) return fromMemory;
  final tokens = description.toLowerCase().split(RegExp(r'[^a-z0-9]+')).where((t) => t.isNotEmpty).toList();
  if (tokens.isEmpty) return null;
  for (final entry in categoryKeywords.entries) {
    if (allowed != null && !allowed.contains(entry.key)) continue;
    if (tokens.any(entry.value.contains)) return entry.key;
  }
  return null;
}
