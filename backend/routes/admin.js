import express from 'express';
import { User, Order, AuditLog } from '../utils/models.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const { page = 1, limit = 50, search, role } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit)||50, 1), 200);
  const parsedPage  = Math.max(parseInt(page)||1, 1);
  const filter = {};
  if (role)   filter.role = role;
  if (search) filter.$or = [
    { name:  { $regex: search.trim(), $options: 'i' } },
    { email: { $regex: search.trim(), $options: 'i' } },
  ];
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((parsedPage-1)*parsedLimit).limit(parsedLimit),
    User.countDocuments(filter),
  ]);
  res.json({ users, total, page: parsedPage, pages: Math.ceil(total/parsedLimit) });
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  const orders = await Order.find({ 'customer.userId': req.params.id }).sort({ createdAt: -1 }).limit(10);
  res.json({ user: user.toJSON(), orders });
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req, res) => {
  const allowed = ['role', 'isActive', 'loyaltyPoints'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!user) throw new AppError('User not found', 404);
  res.json({ user: user.toJSON() });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  res.json({ message: 'User deleted' });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const parsedLimit = Math.min(parseInt(limit)||100, 500);
  const parsedPage  = Math.max(parseInt(page)||1, 1);
  const [logs, total] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).skip((parsedPage-1)*parsedLimit).limit(parsedLimit),
    AuditLog.countDocuments({}),
  ]);
  res.json({ logs, total, page: parsedPage });
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  const [totalOrders, totalUsers, pendingOrders] = await Promise.all([
    Order.countDocuments({}),
    User.countDocuments({}),
    Order.countDocuments({ status: 'pending' }),
  ]);
  res.json({ totalOrders, totalUsers, pendingOrders });
});

export default router;
