import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { config } from '../config.js';
import { signToken } from '../utils/jwt.js';
import { resolveAuthUser, isValidUuid } from '../middleware/auth.js';
import { serialize } from '../utils/serializer.js';

export const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts. Please try again later.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many registrations from this IP. Please try again later.' }
});

// Register new user
authRouter.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.query.users.findFirst({
      where: eq(s.users.email, normalizedEmail)
    });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(s.users).values({
      email: normalizedEmail,
      passwordHash
    }).returning();

    // Create default settings for user
    await db.insert(s.settings).values({
      userId: user.id,
      defaultIncomeAmount: 0,
      defaultIncomeCreditDay: 1,
      defaultSafetyFloor: 0,
      defaultUnplannedAllowance: 0,
      currencySymbol: '₹',
      aiAssistantEnabled: false,
      theme: 'system'
    });

    const token = signToken(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      config.sessionMaxAgeDays
    );

    if (req.session) {
      req.session.userId = user.id;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    return res.status(201).json({
      user: { id: user.id, _id: user.id, email: user.email },
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.query.users.findFirst({
      where: eq(s.users.email, normalizedEmail)
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      config.sessionMaxAgeDays
    );

    if (req.session) {
      req.session.userId = user.id;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    return res.json({
      user: { id: user.id, _id: user.id, email: user.email },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
authRouter.post('/logout', (req, res) => {
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {});
  }
  res.clearCookie('connect.sid');
  return res.json({ message: 'Logged out successfully' });
});

// Current User & Settings
authRouter.get('/me', async (req, res) => {
  try {
    const auth = resolveAuthUser(req);
    if (!auth || !auth.userId || !isValidUuid(auth.userId)) {
      return res.json({ user: null });
    }

    const user = await db.query.users.findFirst({
      where: eq(s.users.id, auth.userId)
    });
    if (!user) {
      return res.json({ user: null });
    }

    const userSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, user.id)
    });

    return res.json({
      user: { id: user.id, _id: user.id, email: user.email },
      settings: serialize(userSettings)
    });
  } catch (err) {
    console.error('Session retrieval error:', err);
    return res.status(500).json({ error: 'Failed to retrieve session' });
  }
});
