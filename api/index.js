import { createApp } from '../apps/server/src/app.js';
import { SalaryCycleJob } from '../apps/server/src/services/salaryCycleJob.js';
import { ensureDatabaseInitialized } from '../apps/server/src/db/index.js';

// Pre-warm database initialization on serverless function cold start (non-blocking)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  ensureDatabaseInitialized().catch((err) => {
    console.warn('[Vercel Serverless] Cold-start pre-warm warning:', err.message);
  });
}

const app = createApp();

// Vercel Cron endpoint: automated hourly check for salary cycle advancement
app.get('/api/cron/salary-cycle', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  // Protect cron endpoint with secret in production if configured
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

export default app;
