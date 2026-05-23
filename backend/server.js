import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config/env.js';
validateEnv();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'express-async-errors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO = !process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '';

// DATABASE
let mongoose;
if (!DEMO) {
  const mg = await import('mongoose');
  mongoose = mg.default;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('✓ MongoDB Atlas Connected');
  } catch (err) {
    logger.error('✗ MongoDB Connection Failed:', err.message);
    process.exit(1);
  }
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
} else {
  logger.warn('⚡ Running in DEMO mode — in-memory database (resets on restart)');
  logger.warn('   Set MONGODB_URI in .env to use a real database.');
}

// ROUTES (imported after DB setup so DEMO flag is set)
const { default: authRoutes }      = await import('./routes/auth.js');
const { default: orderRoutes }     = await import('./routes/orders.js');
const { default: menuRoutes }      = await import('./routes/menu.js');
const { default: paymentRoutes }   = await import('./routes/payments.js');
const { default: analyticsRoutes } = await import('./routes/analytics.js');
const { default: adminRoutes }     = await import('./routes/admin.js');
const { purgeOldLogs, anonymizeOldGuestOrders } = await import('./utils/dataRetention.js');

const app = express();
const PORT = process.env.PORT || 5000;

// SECURITY
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      frameSrc:      ["https://js.stripe.com"],
      connectSrc:    ["'self'", "https://api.stripe.com"],
      imgSrc:        ["'self'", "data:", "https:"],
    }
  }
}));

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET));

// RATE LIMITING
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 20, skipSuccessfulRequests: true }));

// REQUEST LOGGING
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now()-start}ms`));
  next();
});

app.use((req, res, next) => { req.cookieConsent = req.cookies?.cookie_consent === 'accepted'; next(); });

// API ROUTES
app.use('/api/auth',      authRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/menu',      menuRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin',     adminRoutes);

app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  mode: DEMO ? 'demo' : 'production',
  db: DEMO ? 'in-memory' : (mongoose?.connection.readyState === 1 ? 'connected' : 'disconnected'),
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// SERVE FRONTEND
const frontendPath = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` }));
app.use(errorHandler);

if (!DEMO) {
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running nightly data retention job...');
    await purgeOldLogs();
    await anonymizeOldGuestOrders();
  });
}

// Export for Vercel serverless
export default app;

// Listen only when running directly (local dev / traditional host)
if (process.env.VERCEL !== '1') {
  const server = app.listen(PORT, () => {
    logger.info(`🚀 1980 Coffee running on http://localhost:${PORT}`);
    if (DEMO) {
      logger.info('   Demo login → admin@1980coffee.com / Admin1234');
      logger.info(`   Open browser → http://localhost:${PORT}`);
    }
  });

  async function shutdown(signal) {
    logger.info(`${signal} — shutting down...`);
    server.close(async () => {
      if (mongoose) await mongoose.connection.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
