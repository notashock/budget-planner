import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config, isValidMongoUri } from './config.js';
import { defenseFirewall } from './middleware/defense.js';
import { responseEnvelope } from './middleware/envelope.js';
import { errorHandler } from './middleware/errorHandler.js';
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
import { ensureDatabaseInitialized, isDatabaseInitialized } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { errorHandler };

export function createApp(options = {}) {
  const app = express();

  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  const effectiveCorsOrigin = options.corsOrigin ?? (
    config.corsOrigin === '*'
      ? true
      : (config.corsOrigin.includes(',') ? config.corsOrigin.split(',').map((s) => s.trim()) : config.corsOrigin)
  );

  app.use(cors({
    origin: effectiveCorsOrigin,
    credentials: true
  }));

  app.use(express.json());

  // Defensive Security Firewall (Sanitizes inputs, enforces security headers, blocks attacks)
  app.use(defenseFirewall);

  // Standardized Response Envelope Decorator
  app.use(responseEnvelope);

  // Configure Session Store
  const sessionTtlSeconds = (config.sessionMaxAgeDays || 14) * 24 * 60 * 60;
  let store = options.sessionStore;
  const targetMongoUri = options.mongoUri || config.mongoUri;
  const isMongoValid = isValidMongoUri(targetMongoUri, config.isProduction);

  if (!store && options.useMongoStore !== false && isMongoValid) {
    try {
      store = MongoStore.create({
        mongoUrl: targetMongoUri,
        ttl: sessionTtlSeconds,
        autoRemove: 'native'
      });
      if (store && typeof store.on === 'function') {
        store.on('error', (storeErr) => {
          console.warn('[Session Store Notice] MongoDB session connection deferred:', storeErr.message);
        });
      }
    } catch (e) {
      console.warn('[Session Store Warning] Falling back to MemoryStore:', e.message);
      store = undefined;
    }
  } else if (!store && !isMongoValid) {
    console.warn('[Session Store Notice] Operating with ephemeral session store.');
  }

  app.use(
    session({
      secret: options.sessionSecret || config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: store,
      cookie: {
        secure: config.isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: sessionTtlSeconds * 1000
      }
    })
  );

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

  // Mount API v1 domain-driven routers
  app.use('/api/v1/accounts', v1AccountsRouter);
  app.use('/api/v1/transactions', v1TransactionsRouter);
  app.use('/api/v1/periods', v1PeriodsRouter);

  // Mount API legacy compatibility routers
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/months', monthsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api', itemsRouter);
  app.use('/api', transactionsRouter);
  app.use('/api', goalsRouter);
  app.use('/api/bank-accounts', bankAccountsRouter);
  app.use('/api/accounts', bankAccountsRouter);
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
