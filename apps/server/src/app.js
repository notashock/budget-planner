import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { defenseFirewall } from './middleware/defense.js';
import { responseEnvelope } from './middleware/envelope.js';
import { errorHandler } from './middleware/errorHandler.js';
import { csrfGuard } from './middleware/csrf.js';
import { legacyDeprecationNotice } from './middleware/deprecation.js';
import { clockContext } from './utils/clock.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { monthsRouter } from './routes/months.js';
import { itemsRouter } from './routes/items.js';
import { aiRouter } from './routes/ai.js';
import { transactionsRouter } from './routes/transactions.js';
import { goalsRouter } from './routes/goals.js';
import { bankAccountsRouter } from './routes/bankAccounts.js';
import { walletsRouter } from './routes/wallets.js';
import { transfersRouter } from './routes/transfers.js';
import { salaryTemplatesRouter } from './routes/salaryTemplates.js';
import { v1AccountsRouter } from './routes/v1/accounts.js';
import { v1TransactionsRouter } from './routes/v1/transactions.js';
import { v1PeriodsRouter } from './routes/v1/periods.js';
import { v1TransfersRouter } from './routes/v1/transfers.js';
import { v1GoalsRouter } from './routes/v1/goals.js';
import { v1ReportsRouter } from './routes/v1/reports.js';
import { v1PersonFundsRouter } from './routes/v1/personFunds.js';
import { v1CardsRouter } from './routes/v1/cards.js';
import { ensureDatabaseInitialized, isDatabaseInitialized, pool } from './db/index.js';
import { idempotency, createPgIdempotencyStore } from './middleware/idempotency.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { errorHandler };

export function createApp(options = {}) {
  const app = express();

  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  // config.corsOrigin is already validated: never a wildcard (see resolveCorsOrigin)
  const effectiveCorsOrigin = options.corsOrigin ?? config.corsOrigin;

  app.use(cors({
    origin: effectiveCorsOrigin,
    credentials: true
  }));

  app.use(express.json());
  // "Today" is the user's date: the apps send their UTC offset
  app.use(clockContext);

  // Defensive Security Firewall (Sanitizes inputs, enforces security headers, blocks attacks)
  app.use(defenseFirewall);

  // Standardized Response Envelope Decorator
  app.use(responseEnvelope);

  // Cookie-authenticated writes must carry X-Requested-With (CSRF guard)
  app.use('/api', csrfGuard);

  // Authentication is stateless: the web app sends the signed token in the httpOnly
  // bp_auth cookie and the mobile app sends it as a Bearer header (middleware/auth.js).
  // There is no server-side session store.

  // Health check endpoint (public, unauthenticated)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // Auto-bootstrap middleware: In PostgreSQL / Supabase environments, ensures database tables exist
  if (config.databaseUrl) {
    app.use(async (req, res, next) => {
      // If already initialized in this process/container, immediately pass through without DB round-trip
      if (isDatabaseInitialized()) {
        return next();
      }
      try {
        await ensureDatabaseInitialized();
      } catch (err) {
        // Non-fatal: log warning and proceed to route handler so existing healthy tables can be queried
        console.warn('[Database Bootstrap] Non-blocking schema initialization check deferred:', err.message || err);
      }
      next();
    });
  }

  // Writes that carry an Idempotency-Key replay their first response on retry
  // (the mobile app sends one on every write). Tests can pass their own store.
  const idempotencyStore = options.idempotencyStore
    ?? (config.databaseUrl ? createPgIdempotencyStore(pool) : null);
  if (idempotencyStore) {
    app.use('/api/v1', idempotency({ store: idempotencyStore }));
  }

  // Mount API v1 domain-driven routers
  app.use('/api/v1/accounts', v1AccountsRouter);
  app.use('/api/v1/transactions', v1TransactionsRouter);
  app.use('/api/v1/periods', v1PeriodsRouter);
  app.use('/api/v1/transfers', v1TransfersRouter);
  app.use('/api/v1/goals', v1GoalsRouter);
  app.use('/api/v1/reports', v1ReportsRouter);
  app.use('/api/v1/person-funds', v1PersonFundsRouter);
  app.use('/api/v1/cards', v1CardsRouter);

  // Legacy routes that have a v1 equivalent log a one-line deprecation notice.
  // Test runs stay quiet unless a test passes its own logger.
  const deprecationLog = options.deprecationLog
    ?? (process.env.NODE_ENV === 'test' ? () => {} : undefined);
  app.use(legacyDeprecationNotice({ log: deprecationLog }));

  // Mount API legacy compatibility routers (the mobile app still uses these)
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/months', monthsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api', itemsRouter);
  app.use('/api', transactionsRouter);
  app.use('/api', goalsRouter);
  app.use('/api/bank-accounts', bankAccountsRouter);
  app.use('/api/wallets', walletsRouter);
  app.use('/api/transfers', transfersRouter);
  app.use('/api/salary-templates', salaryTemplatesRouter);

  // Serve static web frontend if built (production Docker runtime)
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      // Return 404 for missing static assets rather than masking them with index.html
      if (path.extname(req.path)) {
        return res.status(404).type('text/plain').send('Not found');
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  // Centralized Error Handling Middleware (Catches AppError, PostgreSQL errors, and uncaught exceptions)
  app.use(errorHandler);

  return app;
}
