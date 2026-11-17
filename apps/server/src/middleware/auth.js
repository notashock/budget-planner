import { config } from '../config.js';
import { verifyToken } from '../utils/jwt.js';
import { readAuthCookie } from '../utils/authCookie.js';

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
 * Resolves the authenticated user from the Authorization Bearer header (mobile)
 * or the signed httpOnly auth cookie (web). Sets req.userId and req.user.
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
      return decoded;
    }
  }

  // Web app: signed token in the httpOnly auth cookie
  const cookieToken = readAuthCookie(req);
  if (cookieToken) {
    const decoded = verifyToken(cookieToken, config.jwtSecret);
    if (decoded && decoded.userId && isValidUuid(decoded.userId)) {
      req.userId = decoded.userId;
      req.user = decoded;
      req.authVia = 'cookie';
      return decoded;
    }
  }

  return null;
}

/**
 * Express middleware enforcing authentication via Bearer token or auth cookie.
 */
export function requireAuth(req, res, next) {
  const user = resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
