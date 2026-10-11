import { config } from '../config.js';
import { verifyToken } from '../utils/jwt.js';

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
    if (decoded && decoded.userId) {
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
    req.userId = req.session.userId;
    return { userId: req.session.userId };
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
