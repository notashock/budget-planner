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

export function createApp(options = {}) {
  const app = express();

  app.use(cors({
    origin: options.corsOrigin || true,
    credentials: true
  }));

  app.use(express.json());

  // Configure Session Store
  let store = options.sessionStore;
  if (!store && options.useMongoStore !== false) {
    try {
      store = MongoStore.create({
        mongoUrl: options.mongoUri || config.mongoUri,
        ttl: 14 * 24 * 60 * 60 // 14 days
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
        maxAge: 14 * 24 * 60 * 60 * 1000
      }
    })
  );

  // Mount API routers
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/months', monthsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api', itemsRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
