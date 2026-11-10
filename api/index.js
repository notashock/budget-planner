import { createApp } from '../apps/server/src/app.js';
import { connectDB } from '../apps/server/src/db.js';
import { config } from '../apps/server/src/config.js';

// Process-level shields to prevent unhandled driver rejections from crashing the serverless lambda
process.on('unhandledRejection', (reason) => {
  console.warn('[Vercel Serverless Shield] Intercepted unhandled rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Vercel Serverless Shield] Intercepted uncaught exception:', err?.message || err);
});

let isDbConnecting = false;
let isDbConnected = false;
let hasWarnedPlaceholder = false;

async function ensureDatabase() {
  if (isDbConnected || isDbConnecting) return;
  if (!config.isMongoValid) {
    if (!hasWarnedPlaceholder) {
      console.warn('[Vercel Serverless Notice] MongoDB URI is unconfigured or contains placeholder syntax (<cluster>). Please update MONGODB_URI in Vercel project environment variables.');
      hasWarnedPlaceholder = true;
    }
    return;
  }

  isDbConnecting = true;
  try {
    const conn = await connectDB(config.mongoUri);
    if (conn) {
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
