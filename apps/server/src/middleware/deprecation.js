// Legacy route prefixes that now have an /api/v1 equivalent. They stay mounted
// for the mobile app; each hit is logged so remaining callers can be found.
export const LEGACY_PREFIXES = [
  '/api/bank-accounts',
  '/api/wallets',
  '/api/transfers',
  '/api/transactions',
  '/api/months',
  '/api/goals',
  '/api/items',
  '/api/reports'
];

function isLegacyPath(path) {
  return LEGACY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Logs one line (method + path) per request to a legacy route and marks the
 * response with a `Deprecation` header. The query string is left out of the
 * log line so it never records request data.
 */
export function legacyDeprecationNotice({ log = (line) => console.warn(line) } = {}) {
  return function deprecationNotice(req, res, next) {
    const path = (req.originalUrl || req.url).split('?')[0];
    if (isLegacyPath(path)) {
      res.set('Deprecation', 'true');
      log(`[deprecated] ${req.method} ${path} (use /api/v1)`);
    }
    next();
  };
}
