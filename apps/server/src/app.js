import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized Error Handling Middleware (prevents process crashes)
export function errorHandler(err, req, res, next) {
  console.error('[Unhandled Request Error]:', err.stack || err.message);
  if (res.headersSent) {
    return next(err);
  }
  // Handle database driver connection/selection failures gracefully
  if (
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    (err.name === 'MongooseError' && err.message?.includes('buffering timed out'))
  ) {
    return res.status(503).json({
      error: 'Database service unavailable. Please check your database connection configuration.'
    });
  }
  res.status(err.status || 500).json({
    error: config.isProduction ? 'Internal Server Error' : err.message
  });
}

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

  // Health check endpoint (public, unauthenticated, zero external dependencies)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Configure Session Store
  const sessionTtlSeconds = (config.sessionMaxAgeDays || 14) * 24 * 60 * 60;
  let store = options.sessionStore;
  const targetMongoUri = options.mongoUri || config.mongoUri;
  const isLocalMongoInProd = config.isProduction && (targetMongoUri.includes('127.0.0.1') || targetMongoUri.includes('localhost'));

  if (!store && options.useMongoStore !== false && !isLocalMongoInProd && targetMongoUri) {
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
  } else if (isLocalMongoInProd) {
    console.warn('[Session Store Notice] Production cloud runtime detected with local/unconfigured MONGODB_URI. Operating with ephemeral session store.');
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

  // Mount API routers
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

  // Centralized Error Handling Middleware (prevents process crashes)
  app.use(errorHandler);

  return app;
}
