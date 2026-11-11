import { config } from '../config.js';
import { verifyToken } from '../utils/jwt.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a given string is a valid standard RFC-4122 UUID.
 * Shields PostgreSQL from 22P02 invalid input syntax errors caused by legacy MongoDB ObjectIds.
 * @param {*} id
 * @returns {boolean}
 */
export function isValidUuid(id) {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Resolves the authenticated user from the Authorization Bearer header or session.
 * Shims req.userId and req.session.userId for seamless backward compatibility.
 * @param {import('express').Request} req
 * @returns {object|null}
 */
export function resolveAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const decoded = verifyToken(token, config.jwtSecret);
    if (decoded && decoded.userId && isValidUuid(decoded.userId)) {
      req.userId = decoded.userId;
      req.user = decoded;
      if (!req.session) {
        req.session = {};
      }
      req.session.userId = decoded.userId;
      return decoded;
    }
  }

  if (req.session && req.session.userId) {
    if (isValidUuid(req.session.userId)) {
      req.userId = req.session.userId;
      return { userId: req.session.userId };
    } else {
      // Invalidate legacy or non-UUID session token to prevent Drizzle 22P02 database crashes
      const staleId = req.session.userId;
      delete req.session.userId;
      if (typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
      console.warn(`[Auth Shield] Cleared stale non-UUID session ID: ${staleId}`);
      return null;
    }
  }

  return null;
}

/**
 * Express middleware enforcing authentication via Bearer token or session.
 */
export function requireAuth(req, res, next) {
  const user = resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
