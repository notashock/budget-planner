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

const resolvedSecret = resolveSecret();

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget_planner',
  jwtSecret: resolvedSecret,
  sessionSecret: resolvedSecret,
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS) || 14,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

