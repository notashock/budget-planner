import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from apps/server/ or monorepo root or current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function resolveSecret() {
  const envSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (envSecret && envSecret !== 'dev_session_secret_change_in_production') {
    return envSecret;
  }
  const ephemeralSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '\n[SECURITY WARNING] No persistent JWT_SECRET provided. Generated ephemeral 256-bit secret. ' +
    'User sessions will not survive process restarts unless JWT_SECRET is explicitly set in .env.\n'
  );
  return ephemeralSecret;
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

const resolvedSecret = resolveSecret();
const rawMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget_planner';
const isProd = process.env.NODE_ENV === 'production';
const isMongoValid = isValidMongoUri(rawMongoUri, isProd);

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: rawMongoUri,
  isMongoValid,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: resolvedSecret,
  sessionSecret: resolvedSecret,
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS) || 14,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  isProduction: isProd,
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

