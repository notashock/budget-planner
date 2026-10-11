import crypto from 'crypto';

/**
 * Encodes a JavaScript object or string into a URL-safe Base64 string.
 */
function toBase64Url(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Buffer.from(str, 'utf8').toString('base64url');
}

/**
 * Decodes a URL-safe Base64 string into a parsed JSON object.
 */
function fromBase64Url(str) {
  const jsonStr = Buffer.from(str, 'base64url').toString('utf8');
  return JSON.parse(jsonStr);
}

/**
 * Signs a JWT payload with HMAC-SHA256 using the specified secret.
 * @param {object} payload - Custom claims to embed (e.g. { userId, email })
 * @param {string} secret - Signing secret
 * @param {number} [expiresInDays=14] - Token validity in days
 * @returns {string} Encoded JWT
 */
export function signToken(payload, secret, expiresInDays = 14) {
  if (!secret) {
    throw new Error('JWT secret is required for signing');
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + (expiresInDays * 24 * 60 * 60)
  };

  const headerB64 = toBase64Url(header);
  const payloadB64 = toBase64Url(fullPayload);
  const data = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verifies a JWT token signature and expiration.
 * @param {string} token - Encoded JWT
 * @param {string} secret - Verification secret
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !secret) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signature] = parts;
  const data = `${headerB64}.${payloadB64}`;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = fromBase64Url(payloadB64);
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < nowSec) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    return null;
  }
}
