import crypto from 'crypto';

export function validateEnv() {
  const REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'];
  const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].startsWith('CHANGE_ME'));

  if (missing.length > 0) {
    console.warn('\n⚠️  Missing JWT/session secrets — auto-generating ephemeral values for this instance.');
    console.warn('   Set JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET in your environment for persistence.\n');
    missing.forEach(k => { process.env[k] = crypto.randomBytes(64).toString('hex'); });
  }

  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '') {
    console.warn('\n⚡ MONGODB_URI not set — running in DEMO mode (in-memory database).\n');
  }

  const missingStripe = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']
    .filter(k => !process.env[k] || process.env[k].trim() === '');
  if (missingStripe.length > 0) {
    console.warn('⚠️  Stripe not configured — card payments will be disabled (cash orders work fine).\n');
  }
}
