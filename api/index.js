import { createApp } from '../apps/server/src/app.js';
import { connectDB } from '../apps/server/src/db.js';
import { config } from '../apps/server/src/config.js';
import { SalaryCycleJob } from '../apps/server/src/services/salaryCycleJob.js';
import { ensureDatabaseInitialized } from '../apps/server/src/db/index.js';

// Process-level shields to prevent unhandled driver rejections from crashing the serverless lambda
process.on('unhandledRejection', (reason) => {
  console.warn('[Vercel Serverless Shield] Intercepted unhandled rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Vercel Serverless Shield] Intercepted uncaught exception:', err?.message || err);
});

// Filter out third-party driver deprecation noise (such as [DEP0169] url.parse) from polluting stderr in Node 26
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') {
    return;
  }
  console.warn(`[${warning.name}] ${warning.message}`);
});

let isDbConnecting = false;
let isDbConnected = false;
let hasWarnedPlaceholder = false;

async function ensureDatabase() {
  if (isDbConnected || isDbConnecting) return;

  // Supabase PostgreSQL initialization (primary relational storage)
  if (config.databaseUrl) {
    isDbConnecting = true;
    try {
      await ensureDatabaseInitialized();
      isDbConnected = true;
    } catch (err) {
      console.warn('[Vercel Serverless Notice] Supabase/PostgreSQL initialization deferred:', err.message);
    } finally {
      isDbConnecting = false;
    }
    return;
  }

  // MongoDB backward-compatibility fallback
  if (!config.isMongoValid) {
    if (!hasWarnedPlaceholder) {
      console.warn('[Vercel Serverless Notice] Neither DATABASE_URL nor valid MONGODB_URI configured. Running in decoupled mode.');
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
    console.warn('[Vercel Serverless Notice] MongoDB connection deferred/unavailable:', err.message);
  } finally {
    isDbConnecting = false;
  }
}

const app = createApp();

// Vercel Cron endpoint: automated hourly check for salary cycle advancement
app.get('/api/cron/salary-cycle', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized cron request' });
  }

  try {
    const result = await SalaryCycleJob.runJob();
    return res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      result: result || 'SalaryCycleJob executed'
    });
  } catch (err) {
    console.error('Vercel Cron SalaryCycleJob error:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Cron job execution failed'
    });
  }
});

export default async function handler(req, res) {
  await ensureDatabase();
  return app(req, res);
}
