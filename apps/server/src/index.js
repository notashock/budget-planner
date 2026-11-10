import { config } from './config.js';
import { runMigrations, ensureDatabaseInitialized } from './db/index.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';
import { SalaryCycleJob } from './services/salaryCycleJob.js';

// Process-level crash shields for unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.warn('[Process Shield] Unhandled Rejection intercepted:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process Shield] Uncaught Exception intercepted:', err?.message || err);
});

// Resolve port strictly from process.env.PORT as required by Vercel / Cloud PaaS
const PORT = process.env.PORT ? Number(process.env.PORT) : (config.port || 4000);
const HOST = '0.0.0.0';

const app = createApp();

// Start HTTP server immediately so Vercel, Docker, Railway, or local runners accept TCP connections instantly (<100ms)
const server = app.listen(PORT, HOST, () => {
  console.log(`Budget Planner API server running on http://${HOST}:${PORT} (process.env.PORT=${process.env.PORT || 'unset'})`);
});

// Non-blocking database initialization with graceful error handling and auto-reconnect
async function initDatabase() {
  if (config.databaseUrl) {
    try {
      console.log('Initializing PostgreSQL / Supabase schema and migrations...');
      await runMigrations();
      await ensureDatabaseInitialized();

      // Run initial SalaryCycleJob check
      try {
        await SalaryCycleJob.runJob();
      } catch (jobErr) {
        console.warn('Initial SalaryCycleJob run notice:', jobErr.message);
      }

      // Schedule periodic hourly SalaryCycleJob
      setInterval(async () => {
        try {
          await SalaryCycleJob.runJob();
        } catch (err) {
          console.error('Periodic SalaryCycleJob error:', err.message);
        }
      }, 60 * 60 * 1000);
    } catch (pgErr) {
      console.warn('[Startup Notice] PostgreSQL initialization deferred:', pgErr.message);
    }
    return;
  }

  if (!config.isMongoValid) {
    console.warn('[Startup Notice] Neither DATABASE_URL nor valid MONGODB_URI configured. Running server in decoupled mode.');
    return;
  }

  const uri = config.mongoUri;
  try {
    const conn = await connectDB(uri);
    if (conn) {
      console.log(`Connected to MongoDB at ${uri}`);
    }
  } catch (err) {
    console.warn(`[Startup Notice] MongoDB connection deferred/failed: ${err.message}`);
    console.log('Server is accepting TCP connections. Will retry connecting to MongoDB in 5 seconds...');
    setTimeout(initDatabase, 5000);
  }
}

initDatabase();

// Handle graceful termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed cleanly');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed cleanly');
    process.exit(0);
  });
});

export { app, server };
