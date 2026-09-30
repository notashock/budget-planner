import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { monthsRouter } from './routes/months.js';
import { itemsRouter } from './routes/items.js';
import { aiRouter } from './routes/ai.js';
import { transactionsRouter } from './routes/transactions.js';
import { goalsRouter } from './routes/goals.js';

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

  // Configure Session Store
  const sessionTtlSeconds = (config.sessionMaxAgeDays || 14) * 24 * 60 * 60;
  let store = options.sessionStore;
  if (!store && options.useMongoStore !== false) {
    try {
      store = MongoStore.create({
        mongoUrl: options.mongoUri || config.mongoUri,
        ttl: sessionTtlSeconds
      });
    } catch (e) {
      // MemoryStore fallback if MongoDB store creation fails
      store = undefined;
    }
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
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routers
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/months', monthsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api', itemsRouter);
  app.use('/api', transactionsRouter);
  app.use('/api', goalsRouter);

  return app;
}
