import express from 'express';
import { Order, User, AuditLog } from '../utils/models.js';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const STRIPE_ENABLED = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim());

let stripe;
if (STRIPE_ENABLED) {
  const Stripe = (await import('stripe')).default;
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/payments/create-intent
router.post('/create-intent', optionalAuth, async (req, res) => {
  if (!STRIPE_ENABLED) throw new AppError('Stripe payments not configured on this server', 503);
  const { orderId, currency = 'egp' } = req.body;
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.payment?.status === 'paid') throw new AppError('Order already paid', 400);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(order.total * 100),
    currency,
    metadata: { orderId: order._id.toString(), orderRef: order.orderRef || '' },
    description: `1980 Coffee — Order ${order.orderRef || order._id}`,
  });

  order.payment = { ...(order.payment||{}), stripePaymentIntentId: paymentIntent.id };
  await order.save();

  try { await AuditLog.create({ action: 'payment.intent_created', actor: { userId: req.user?._id, ip: req.ip }, target: { type: 'Order', id: orderId }, metadata: { amount: order.total } }); } catch (_) {}
  res.json({ clientSecret: paymentIntent.client_secret });
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!STRIPE_ENABLED) return res.json({ received: true });
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Stripe webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const order  = await Order.findOne({ 'payment.stripePaymentIntentId': intent.id });
    if (order) {
      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      order.status = 'confirmed';
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({ status: 'confirmed', updatedBy: 'stripe-webhook' });
      await order.save();
    }
  }

  res.json({ received: true });
});

// POST /api/payments/refund
router.post('/refund', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!STRIPE_ENABLED) throw new AppError('Stripe not configured', 503);
  const { orderId } = req.body;
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.payment?.status !== 'paid') throw new AppError('Order is not paid', 400);
  if (!order.payment?.stripeChargeId) throw new AppError('No charge ID on file', 400);

  const refund = await stripe.refunds.create({ charge: order.payment.stripeChargeId });
  order.payment.status = 'refunded';
  order.status = 'refunded';
  await order.save();

  res.json({ message: 'Refund processed', refundId: refund.id });
});

export default router;
