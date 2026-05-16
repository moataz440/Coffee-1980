import express from 'express';
import { MenuItem, Order, User, AuditLog } from '../utils/models.js';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validate, createOrderSchema, updateOrderStatusSchema } from '../config/validation.js';

const router = express.Router();

// POST /api/orders
router.post('/', optionalAuth, validate(createOrderSchema), async (req, res) => {
  const { items, type, tableNumber, deliveryAddress, notes, customerInfo, paymentMethod, usePoints } = req.body;

  if (type === 'delivery' && !deliveryAddress?.trim()) throw new AppError('Delivery address required', 400);
  if (type === 'dine-in'  && !tableNumber?.trim())    throw new AppError('Table number required', 400);

  // Server-side price verification
  const menuItemIds = items.filter(i => i.menuItemId).map(i => i.menuItemId);
  const dbItems = menuItemIds.length > 0
    ? await MenuItem.find({ _id: { $in: menuItemIds }, isAvailable: true })
    : [];
  const dbPriceMap = Object.fromEntries(
    (Array.isArray(dbItems) ? dbItems : []).map(i => [i._id?.toString() || i._id, i.price])
  );

  const verifiedItems = items.map(item => {
    const dbPrice = item.menuItemId ? dbPriceMap[item.menuItemId] : null;
    if (item.menuItemId && dbPrice === undefined) throw new AppError(`"${item.name}" is unavailable`, 400);
    const price = dbPrice ?? item.price;
    return { ...item, price, subtotal: price * item.qty };
  });

  const subtotal = verifiedItems.reduce((s, i) => s + i.subtotal, 0);
  let loyaltyDiscount = 0;
  if (req.user && usePoints && req.user.loyaltyPoints > 0) {
    const maxPts = Math.min(req.user.loyaltyPoints, Math.floor(subtotal * 0.2));
    loyaltyDiscount = maxPts;
    await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: -loyaltyDiscount } });
  }

  const total = subtotal - loyaltyDiscount;
  const order = await Order.create({
    customer: {
      userId: req.user?._id,
      name:   req.user?.name  || customerInfo?.name,
      phone:  req.user?.phone || customerInfo?.phone,
      email:  req.user?.email || customerInfo?.email,
      isGuest: !req.user,
    },
    items: verifiedItems,
    subtotal,
    discount: 0,
    loyaltyDiscount,
    total,
    type,
    tableNumber,
    deliveryAddress,
    notes,
    payment: { method: paymentMethod, status: 'pending' },
    statusHistory: [{ status: 'pending', updatedBy: req.user?.email || 'guest' }],
    status: 'pending',
    isAnonymized: false,
  });

  try { await AuditLog.create({ action: 'order.created', actor: { userId: req.user?._id, email: req.user?.email, ip: req.ip }, target: { type: 'Order', id: order._id.toString() }, metadata: { total, type } }); } catch (_) {}
  res.status(201).json({ order });
});

// GET /api/orders — admin/staff all orders
router.get('/', authenticateToken, requireRole('admin','staff'), async (req, res) => {
  const { status, page = 1, limit = 50, type } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit)||50, 1), 200);
  const parsedPage  = Math.max(parseInt(page)||1, 1);
  const filter = {};
  if (status) filter.status = status;
  if (type)   filter.type   = type;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((parsedPage-1)*parsedLimit).limit(parsedLimit),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, total, page: parsedPage, pages: Math.ceil(total/parsedLimit) });
});

// GET /api/orders/my — logged in user's orders
router.get('/my', authenticateToken, async (req, res) => {
  const orders = await Order.find({ 'customer.userId': req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ orders });
});

// GET /api/orders/:id
router.get('/:id', optionalAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError('Order not found', 404);
  // Guest can view their own order if they have the ID; authed users must own it or be staff
  if (req.user && req.user.role === 'customer' && order.customer?.userId?.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized', 403);
  }
  res.json({ order });
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', authenticateToken, requireRole('admin','staff'), validate(updateOrderStatusSchema), async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError('Order not found', 404);
  order.status = status;
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status, timestamp: new Date(), updatedBy: req.user.email });
  await order.save();
  try { await AuditLog.create({ action: 'order.status_changed', actor: { userId: req.user._id, email: req.user.email, ip: req.ip }, target: { type: 'Order', id: order._id.toString() }, metadata: { status } }); } catch (_) {}
  res.json({ order });
});

// DELETE /api/orders/:id — cancel
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError('Order not found', 404);
  order.status = 'cancelled';
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: 'cancelled', timestamp: new Date(), updatedBy: req.user.email });
  await order.save();
  res.json({ message: 'Order cancelled' });
});

export default router;
