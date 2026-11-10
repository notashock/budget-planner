import { createApp } from '../apps/server/src/app.js';
import { connectDB } from '../apps/server/src/db.js';
import { config } from '../apps/server/src/config.js';

let isDbConnecting = false;
let isDbConnected = false;

async function ensureDatabase() {
  if (isDbConnected || isDbConnecting) return;
  isDbConnecting = true;
  try {
    // Only attempt MongoDB connection if valid remote URI is provided or in non-production
    const isLocalInProd = config.isProduction && (config.mongoUri.includes('127.0.0.1') || config.mongoUri.includes('localhost'));
    if (!isLocalInProd && config.mongoUri) {
      await connectDB(config.mongoUri);
      isDbConnected = true;
    }
  } catch (err) {
    console.warn('[Vercel Serverless Notice] Database connection deferred/unavailable:', err.message);
  } finally {
    isDbConnecting = false;
  }
}

const app = createApp();

export default async function handler(req, res) {
  await ensureDatabase();
  return app(req, res);
}
