import { rememberedCategory } from './entryMemory.js';

/**
 * Category suggested for a spend or planned bill from its description:
 * what the user picked last time for the same description, otherwise a
 * keyword match. Returns null when nothing fits (the form keeps its default).
 *
 * Mirrored in apps/mobile/lib/engine/category_suggest.dart; keep the two lists in step.
 */
export const CATEGORY_KEYWORDS = {
  Food: [
    'grocery', 'groceries', 'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'tea', 'lunch', 'dinner',
    'breakfast', 'snack', 'snacks', 'milk', 'vegetable', 'vegetables', 'fruit', 'fruits', 'bakery', 'food',
    'pizza', 'burger', 'dominos', 'mcdonald', 'kfc', 'blinkit', 'zepto', 'bigbasket', 'instamart', 'dmart', 'meal'
  ],
  Travel: [
    'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'irctc', 'flight', 'cab', 'taxi', 'auto', 'fuel',
    'petrol', 'diesel', 'parking', 'toll', 'fastag', 'travel', 'trip', 'airport', 'indigo', 'railway'
  ],
  Utilities: [
    'electricity', 'power', 'water', 'gas', 'internet', 'broadband', 'wifi', 'recharge', 'mobile', 'phone',
    'dth', 'rent', 'maintenance', 'airtel', 'jio', 'bsnl', 'vodafone', 'bill', 'subscription', 'netflix', 'spotify'
  ],
  Health: [
    'doctor', 'hospital', 'pharmacy', 'medicine', 'medicines', 'medical', 'clinic', 'apollo', 'dental', 'dentist',
    'lab', 'checkup', 'gym', 'health', 'chemist', 'physio', 'insurance'
  ]
};

const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function suggestCategory(description, { allowed = null, remembered = rememberedCategory } = {}) {
  const fromMemory = remembered(description);
  if (fromMemory && (!allowed || allowed.includes(fromMemory))) return fromMemory;
  const tokens = words(description);
  if (tokens.length === 0) return null;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (allowed && !allowed.includes(category)) continue;
    if (tokens.some((t) => keywords.includes(t))) return category;
  }
  return null;
}
