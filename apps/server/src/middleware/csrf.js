import { readAuthCookie } from '../utils/authCookie.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for cookie-authenticated requests.
 *
 * A browser sends the auth cookie with cross-site form posts too. Requiring a
 * custom header on state-changing requests stops that: other sites cannot add
 * custom headers without a CORS preflight, which the origin allowlist rejects.
 * Bearer-token clients (the mobile app) are unaffected because they do not rely
 * on ambient cookies.
 */
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.headers.authorization) return next();
  if (!readAuthCookie(req)) return next();
  if (req.get('X-Requested-With')) return next();
  return res.status(403).json({ error: 'Missing X-Requested-With header for a cookie-authenticated request' });
}
