import { config } from '../config.js';

/**
 * httpOnly auth cookie for the web app.
 *
 * Holds the same signed token the mobile app sends as a Bearer header, so it is
 * stateless (works on serverless instances, unlike the in-memory session store)
 * and can never be read by page scripts, unlike a token kept in localStorage.
 */
export const AUTH_COOKIE = 'bp_auth';

function cookieOptions() {
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: config.isProduction || sameSite === 'none',
    sameSite,
    path: '/',
    maxAge: (config.sessionMaxAgeDays || 14) * 24 * 60 * 60 * 1000
  };
}

export function setAuthCookie(res, token) {
  if (!token || typeof res.cookie !== 'function') return;
  res.cookie(AUTH_COOKIE, token, cookieOptions());
}

export function clearAuthCookie(res) {
  if (typeof res.clearCookie !== 'function') return;
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(AUTH_COOKIE, opts);
}

/** Reads the auth cookie from the raw Cookie header (no cookie-parser needed). */
export function readAuthCookie(req) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === AUTH_COOKIE) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
