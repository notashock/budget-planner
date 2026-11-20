import crypto from 'crypto';
import { resolveAuthUser } from './auth.js';

/**
 * Idempotent writes: a client sends `Idempotency-Key: <uuid>` on a POST, PUT,
 * PATCH or DELETE, and a retry with the same key replays the first response
 * instead of running the write again. The mobile app relies on this so a
 * timed-out save that is tapped again, or an offline entry that syncs twice,
 * creates one transaction (docs/MOBILE_APP_UPGRADE_PLAN.md, 1.6).
 *
 * Rules:
 * - Keys are scoped to the signed-in user; requests with no user pass through.
 * - The key is reserved before the handler runs, so a second request with the
 *   same key while the first is still running gets 409 and does not run.
 * - Only 2xx responses are stored and replayed, byte for byte. Any other
 *   result releases the key, so a retry can run the write.
 * - The same key with a different method, path or body gets 422.
 * - Stored keys expire after 24 hours; a reservation left by a crashed
 *   request expires after 2 minutes.
 * - If the store fails, the request runs without idempotency (fail open), so
 *   a missing table never blocks writes.
 */

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const KEY_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 2 * 60 * 1000;
const MAX_KEY_LENGTH = 255;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requestFingerprint(req) {
  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '';
  return crypto
    .createHash('sha256')
    .update(`${req.method.toUpperCase()} ${req.originalUrl}\n${body}`)
    .digest('hex');
}

/**
 * Postgres store. Table: idempotency_keys (see syncIdempotencySchema in db/index.js).
 */
export function createPgIdempotencyStore(pool) {
  return {
    async reserve(userId, key, fingerprint) {
      // Drop this key if it expired, or if its reservation was abandoned.
      await pool.query(
        `DELETE FROM idempotency_keys
         WHERE user_id = $1 AND key = $2
           AND (created_at < now() - ($3 || ' milliseconds')::interval
                OR (state = 'pending' AND created_at < now() - ($4 || ' milliseconds')::interval))`,
        [userId, key, String(KEY_TTL_MS), String(PENDING_TTL_MS)]
      );
      const inserted = await pool.query(
        `INSERT INTO idempotency_keys (user_id, key, fingerprint, state)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (user_id, key) DO NOTHING
         RETURNING key`,
        [userId, key, fingerprint]
      );
      if (inserted.rowCount > 0) return { state: 'reserved' };

      const existing = await pool.query(
        `SELECT fingerprint, state, status_code, content_type, response_body
         FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [userId, key]
      );
      const row = existing.rows[0];
      // Released between our insert and select: treat as in progress, client retries.
      if (!row) return { state: 'pending' };
      if (row.fingerprint !== fingerprint) return { state: 'mismatch' };
      if (row.state !== 'done') return { state: 'pending' };
      return {
        state: 'done',
        statusCode: row.status_code,
        contentType: row.content_type,
        body: row.response_body
      };
    },

    async complete(userId, key, statusCode, contentType, body) {
      await pool.query(
        `UPDATE idempotency_keys
         SET state = 'done', status_code = $3, content_type = $4, response_body = $5
         WHERE user_id = $1 AND key = $2`,
        [userId, key, statusCode, contentType, body]
      );
    },

    async release(userId, key) {
      await pool.query(
        `DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND state = 'pending'`,
        [userId, key]
      );
    }
  };
}

/**
 * In-memory store with the same contract, for tests.
 */
export function createMemoryIdempotencyStore({ now = () => Date.now() } = {}) {
  const rows = new Map();
  const id = (userId, key) => `${userId}\u0000${key}`;
  return {
    rows,
    async reserve(userId, key, fingerprint) {
      const k = id(userId, key);
      const row = rows.get(k);
      if (row) {
        const age = now() - row.createdAt;
        if (age > KEY_TTL_MS || (row.state === 'pending' && age > PENDING_TTL_MS)) rows.delete(k);
      }
      const current = rows.get(k);
      if (!current) {
        rows.set(k, { fingerprint, state: 'pending', createdAt: now() });
        return { state: 'reserved' };
      }
      if (current.fingerprint !== fingerprint) return { state: 'mismatch' };
      if (current.state !== 'done') return { state: 'pending' };
      return {
        state: 'done',
        statusCode: current.statusCode,
        contentType: current.contentType,
        body: current.body
      };
    },
    async complete(userId, key, statusCode, contentType, body) {
      const row = rows.get(id(userId, key));
      if (row) Object.assign(row, { state: 'done', statusCode, contentType, body });
    },
    async release(userId, key) {
      const k = id(userId, key);
      if (rows.get(k)?.state === 'pending') rows.delete(k);
    }
  };
}

function sendError(res, statusCode, code, message) {
  if (typeof res.fail === 'function') return res.fail(code, message, null, statusCode);
  return res.status(statusCode).json({ status: 'error', error: { code, message } });
}

export function idempotency({ store, log = console } = {}) {
  if (!store) throw new Error('idempotency middleware needs a store');

  return async function idempotencyMiddleware(req, res, next) {
    if (!MUTATING.has(req.method.toUpperCase())) return next();

    const raw = req.headers[IDEMPOTENCY_HEADER];
    if (raw === undefined) return next();

    const key = String(raw).trim();
    if (!key || key.length > MAX_KEY_LENGTH) {
      return sendError(res, 400, 'INVALID_IDEMPOTENCY_KEY',
        `Idempotency-Key must be 1-${MAX_KEY_LENGTH} characters`);
    }

    const userId = req.userId || resolveAuthUser(req)?.userId;
    // Unauthenticated: the route answers 401; nothing to protect.
    if (!userId) return next();

    let reservation;
    try {
      reservation = await store.reserve(userId, key, requestFingerprint(req));
    } catch (err) {
      log.warn?.('[idempotency] store unavailable, running request without it:', err.message || err);
      return next();
    }

    res.setHeader('Idempotency-Key', key);

    if (reservation.state === 'mismatch') {
      return sendError(res, 422, 'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request');
    }
    if (reservation.state === 'pending') {
      res.setHeader('Retry-After', '1');
      return sendError(res, 409, 'IDEMPOTENCY_IN_PROGRESS',
        'A request with this Idempotency-Key is still being processed');
    }
    if (reservation.state === 'done') {
      res.setHeader('Idempotent-Replayed', 'true');
      if (reservation.contentType) res.setHeader('Content-Type', reservation.contentType);
      res.statusCode = reservation.statusCode;
      return res.end(reservation.body ?? '');
    }

    // Reserved: run the handler and capture what it sends. express's res.json
    // (and the envelope's res.success / res.fail) all end in res.send.
    // The result is recorded when the handler responds, even if the client has
    // already hung up, so a retry replays it rather than running the write again.
    // If the handler never responds, the reservation expires (PENDING_TTL_MS).
    let captured = null;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const write = ok
        ? store.complete(userId, key, res.statusCode, res.getHeader('Content-Type') || null, captured ?? '')
        : store.release(userId, key);
      Promise.resolve(write).catch((err) => {
        log.warn?.('[idempotency] could not record result:', err.message || err);
      });
    };

    const originalSend = res.send.bind(res);
    res.send = function captureSend(body) {
      if (captured === null) {
        if (typeof body === 'string') captured = body;
        else if (Buffer.isBuffer(body)) captured = body.toString('utf8');
      }
      const out = originalSend(body);
      settle();
      return out;
    };
    // Responses that skip res.send (e.g. res.status(204).end()).
    res.on('finish', settle);

    return next();
  };
}

export default idempotency;
