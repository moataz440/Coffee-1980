/**
 * Environment variable validation.
 * Crashes fast if JWT secrets are missing.
 * MongoDB and Stripe are optional — app runs in demo/cash-only mode without them.
 */

export function validateEnv() {
  const REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'];
  const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].startsWith('CHANGE_ME'));

  if (missing.length > 0) {
    console.error('\n❌ Missing or unconfigured required environment variables:');
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('\nCopy .env.example → .env and fill in all required values.\n');
    process.exit(1);
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
