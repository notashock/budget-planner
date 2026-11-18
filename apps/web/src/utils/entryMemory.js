/**
 * Remembered entry defaults, per browser: the last account used for each kind of
 * entry, the last transfer pair, and the category last used for a description.
 *
 * This is a convenience only. Storage can be missing or blocked (private mode,
 * cleared site data), so every read and write is guarded and the forms work
 * the same without it.
 */
const KEY = 'bp.entryMemory.v1';
const MAX_DESCRIPTIONS = 200;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(memory) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable: nothing to remember
  }
}

/** Normalised key for a description: lower case, single spaces, trimmed. */
export function descriptionKey(description) {
  return String(description || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Last account ({ accountType, accountId }) used for a mode, or null. */
export function lastAccountFor(mode) {
  const entry = read().accounts?.[mode];
  return entry && entry.accountId ? entry : null;
}

export function rememberAccount(mode, accountType, accountId) {
  if (!mode || !accountId) return;
  const memory = read();
  memory.accounts = { ...(memory.accounts || {}), [mode]: { accountType, accountId } };
  write(memory);
}

/** Last transfer pair { source, destination }, each { accountType, accountId }, or null. */
export function lastTransferPair() {
  const pair = read().transferPair;
  return pair && pair.source?.accountId && pair.destination?.accountId ? pair : null;
}

export function rememberTransferPair(source, destination) {
  if (!source?.accountId || !destination?.accountId) return;
  const memory = read();
  memory.transferPair = { source, destination };
  write(memory);
}

/** Category last saved with this exact description, or null. */
export function rememberedCategory(description) {
  const key = descriptionKey(description);
  if (!key) return null;
  return read().categories?.[key] || null;
}

export function rememberCategory(description, category) {
  const key = descriptionKey(description);
  if (!key || !category) return;
  const memory = read();
  const categories = { ...(memory.categories || {}) };
  delete categories[key];
  categories[key] = category;
  // Keep the most recent descriptions only
  const keys = Object.keys(categories);
  if (keys.length > MAX_DESCRIPTIONS) {
    keys.slice(0, keys.length - MAX_DESCRIPTIONS).forEach((k) => delete categories[k]);
  }
  memory.categories = categories;
  write(memory);
}
