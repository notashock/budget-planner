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

const DEFAULT_JWT_SECRET = 'budget_planner_persistent_jwt_secret_key_2026_super_secure';

function resolveSecret() {
  const envSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (envSecret && envSecret.trim()) {
    return envSecret.trim();
  }
  return DEFAULT_JWT_SECRET;
}

const resolvedSecret = resolveSecret();

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ashok25:Dhathri%4025@localhost:5432/budget_planner',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget_planner',
  jwtSecret: resolvedSecret,
  sessionSecret: resolvedSecret,
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS) || 14,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

