import express from 'express';
import jwt from 'jsonwebtoken';
import { User, AuditLog } from '../utils/models.js';
import { authenticateToken } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { validate, registerSchema, loginSchema, changePasswordSchema, updateProfileSchema } from '../config/validation.js';

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

function generateTokens(userId) {
  const accessToken  = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password, phone, cookieConsent, marketingOptIn } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already registered', 409);

  const user = await User.create({
    name, email, password, phone,
    role: 'customer',
    isActive: true,
    loyaltyPoints: 0,
    loginCount: 1,
    cookieConsent: !!cookieConsent,
    cookieConsentDate: cookieConsent ? new Date() : undefined,
    marketingOptIn: !!marketingOptIn,
  });

  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshTokens = [refreshToken];
  user.lastLogin = new Date();
  await user.save();

  try {
    await AuditLog.create({
      action: 'user.register',
      actor: { userId: user._id, email: user.email, ip: req.ip },
      target: { type: 'User', id: user._id.toString() },
    });
  } catch (_) {}

  res.cookie('accessToken',  accessToken,  { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.status(201).json({ message: 'Account created', user: user.toJSON() });
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +refreshTokens +isActive');
  if (!user || !(await user.comparePassword(password))) {
    try { await AuditLog.create({ action: 'user.login_failed', actor: { email, ip: req.ip }, severity: 'warning' }); } catch (_) {}
    throw new AppError('Invalid email or password', 401);
  }

  if (user.isActive === false) throw new AppError('Account deactivated. Contact support.', 403);

  const { accessToken, refreshToken } = generateTokens(user._id);
  user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
  user.lastLogin  = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  try {
    await AuditLog.create({
      action: 'user.login',
      actor: { userId: user._id, email: user.email, role: user.role, ip: req.ip },
    });
  } catch (_) {}

  res.cookie('accessToken',  accessToken,  { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ message: 'Login successful', user: user.toJSON() });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  if (!token) throw new AppError('Refresh token required', 401);

  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET); }
  catch { throw new AppError('Invalid or expired refresh token', 401); }

  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user || !(user.refreshTokens || []).includes(token)) {
    if (user) { user.refreshTokens = []; await user.save(); }
    throw new AppError('Refresh token reuse detected. Please login again.', 401);
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
  user.refreshTokens = (user.refreshTokens || []).filter(t => t !== token).concat(newRefreshToken);
  await user.save();

  res.cookie('accessToken',  accessToken,      { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', newRefreshToken,  { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ message: 'Token refreshed' });
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    const user = await User.findById(req.user._id).select('+refreshTokens');
    if (user) { user.refreshTokens = (user.refreshTokens || []).filter(t => t !== token); await user.save(); }
  }
  try { await AuditLog.create({ action: 'user.logout', actor: { userId: req.user._id, email: req.user.email, ip: req.ip } }); } catch (_) {}
  res.clearCookie('accessToken',  COOKIE_OPTIONS);
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => res.json({ user: req.user.toJSON() }));

// PATCH /api/auth/me
router.patch('/me', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  const allowed = ['name', 'phone', 'marketingOptIn'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json({ user: user.toJSON() });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!user) throw new AppError('User not found', 404);
  if (!(await user.comparePassword(currentPassword))) throw new AppError('Current password is incorrect', 400);
  if (currentPassword === newPassword) throw new AppError('New password must be different', 400);
  user.password = newPassword;
  user.refreshTokens = [];
  await user.save();
  res.clearCookie('accessToken',  COOKIE_OPTIONS);
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
  res.json({ message: 'Password changed. Please log in again.' });
});

// POST /api/auth/cookie-consent
router.post('/cookie-consent', async (req, res) => {
  const { consent } = req.body;
  if (typeof consent !== 'boolean') throw new AppError('consent must be a boolean', 400);
  if (consent) {
    res.cookie('cookie_consent', 'accepted', { maxAge: 365*24*60*60*1000, httpOnly: false, sameSite: 'lax' });
  } else {
    res.clearCookie('cookie_consent');
  }
  res.json({ message: `Cookie consent ${consent ? 'granted' : 'withdrawn'}` });
});

export default router;
