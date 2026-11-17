import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from apps/server/ or monorepo root or current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Old committed fallback. Kept only so it can be rejected if it is still set anywhere.
export const LEGACY_DEFAULT_JWT_SECRET = 'budget_planner_persistent_jwt_secret_key_2026_super_secure';

const DEV_SECRET_FILE = path.resolve(__dirname, '../.jwt-dev-secret');

/**
 * Resolves the token/session signing secret.
 *
 * - Production: JWT_SECRET (or SESSION_SECRET) is required. Startup fails if it is
 *   missing or still equal to the old secret that was committed to the repository,
 *   because anyone with the repo could otherwise forge a login for any user.
 * - Development/test: if unset, use a random secret persisted to a git-ignored
 *   local file so tokens survive restarts without a shared, committed value.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{ isProduction?: boolean, devSecretFile?: string|null }} [opts]
 * @returns {string}
 */
export function resolveSecret(env = process.env, { isProduction = false, devSecretFile = DEV_SECRET_FILE } = {}) {
  const raw = String(env.JWT_SECRET || env.SESSION_SECRET || '').trim();

  if (raw && raw === LEGACY_DEFAULT_JWT_SECRET) {
    if (isProduction) {
      throw new Error('[Config] JWT_SECRET is set to the old public default. Generate a new secret (e.g. `openssl rand -hex 32`) before starting in production.');
    }
    console.warn('[Config] JWT_SECRET equals the old public default; using a local development secret instead.');
  } else if (raw) {
    if (isProduction && raw.length < 32) {
      console.warn('[Config] JWT_SECRET is shorter than 32 characters; use a longer random value.');
    }
    return raw;
  }

  if (isProduction) {
    throw new Error('[Config] JWT_SECRET (or SESSION_SECRET) must be set in production. Refusing to start with a default signing secret.');
  }

  if (devSecretFile) {
    try {
      if (fs.existsSync(devSecretFile)) {
        const stored = fs.readFileSync(devSecretFile, 'utf8').trim();
        if (stored.length >= 32) return stored;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(devSecretFile, generated, { encoding: 'utf8', mode: 0o600 });
      return generated;
    } catch {
      // Read-only filesystem: fall through to a per-process secret.
    }
  }
  return crypto.randomBytes(32).toString('hex');
}

const DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * Resolves the CORS origin setting. Credentials are always enabled, so a
 * wildcard would let any website make logged-in requests: it is rejected in
 * production and narrowed to local dev origins elsewhere.
 *
 * @param {string|undefined} raw
 * @param {{ isProduction?: boolean }} [opts]
 * @returns {string|string[]}
 */
export function resolveCorsOrigin(raw, { isProduction = false } = {}) {
  const value = String(raw || 'http://localhost:3000').trim();
  const list = value.split(',').map((s) => s.trim()).filter(Boolean);

  if (list.includes('*')) {
    if (isProduction) {
      throw new Error('[Config] CORS_ORIGIN="*" is not allowed in production because requests carry login cookies. List the allowed origins instead, comma-separated.');
    }
    console.warn('[Config] CORS_ORIGIN="*" narrowed to local development origins.');
    return DEV_CORS_ORIGINS;
  }
  return list.length === 1 ? list[0] : list;
}

export function isValidMongoUri(uri, isProduction = false) {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
    return false;
  }
  // Detect template placeholders like <cluster>, <password>, <username>
  if (trimmed.includes('<') || trimmed.includes('>')) {
    return false;
  }
  if (isProduction && (trimmed.includes('127.0.0.1') || trimmed.includes('localhost'))) {
    return false;
  }
  return true;
}

const isProd = process.env.NODE_ENV === 'production';
const resolvedSecret = resolveSecret(process.env, { isProduction: isProd });
const rawMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget_planner';
const isMongoValid = isValidMongoUri(rawMongoUri, isProd);

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || (isProd ? '' : 'postgresql://postgres:postgrespassword@127.0.0.1:5432/budget_planner'),
  mongoUri: rawMongoUri,
  isMongoValid,
  jwtSecret: resolvedSecret,
  sessionSecret: resolvedSecret,
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS) || 14,
  corsOrigin: resolveCorsOrigin(process.env.CORS_ORIGIN, { isProduction: isProd }),
  isProduction: isProd,
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

