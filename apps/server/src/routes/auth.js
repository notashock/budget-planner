import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Setting } from '../models/Setting.js';

export const authRouter = express.Router();

// Register new user
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: normalizedEmail, passwordHash });

    // Create default settings for user
    await Setting.create({
      userId: user._id,
      defaultIncomeAmount: 0,
      defaultIncomeCreditDay: 1,
      defaultSafetyFloor: 0,
      currencySymbol: '$',
      aiAssistantEnabled: false
    });

    req.session.userId = user._id.toString();
    return res.status(201).json({
      user: { id: user._id, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user._id.toString();
    return res.json({
      user: { id: user._id, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully' });
  });
});

// Current User & Settings
authRouter.get('/me', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ user: null });
    }

    const user = await User.findById(req.session.userId).select('-passwordHash');
    if (!user) {
      return res.json({ user: null });
    }

    const settings = await Setting.findOne({ userId: user._id });
    return res.json({
      user: { id: user._id, email: user.email },
      settings
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve session' });
  }
});
