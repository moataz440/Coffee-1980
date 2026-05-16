import express from 'express';
import { Order, User, AuditLog } from '../utils/models.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/overview
router.get('/overview', authenticateToken, requireRole('admin'), async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayOrders, weekOrders, monthOrders, totalOrders, totalUsers, pendingOrders] = await Promise.all([
    Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } }),
    Order.find({ createdAt: { $gte: weekStart  }, status: { $ne: 'cancelled' } }),
    Order.find({ createdAt: { $gte: monthStart }, status: { $ne: 'cancelled' } }),
    Order.countDocuments({ status: { $ne: 'cancelled' } }),
    User.countDocuments({ role: 'customer' }),
    Order.countDocuments({ status: 'pending' }),
  ]);

  const sum = arr => (Array.isArray(arr) ? arr : []).reduce((s, o) => s + (o.total||0), 0);

  res.json({
    kpis: {
      todayRevenue:  sum(todayOrders),
      todayOrders:   Array.isArray(todayOrders) ? todayOrders.length : 0,
      weekRevenue:   sum(weekOrders),
      weekOrders:    Array.isArray(weekOrders)  ? weekOrders.length  : 0,
      monthRevenue:  sum(monthOrders),
      monthOrders:   Array.isArray(monthOrders) ? monthOrders.length : 0,
      totalOrders,
      totalUsers,
      pendingOrders,
      avgOrderValue: (Array.isArray(weekOrders) && weekOrders.length)
        ? Math.round(sum(weekOrders) / weekOrders.length) : 0,
    }
  });
});

// GET /api/analytics/revenue-chart
router.get('/revenue-chart', authenticateToken, requireRole('admin'), async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled','refunded'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({ data });
  } catch (_) {
    res.json({ data: [] });
  }
});

// GET /api/analytics/top-items
router.get('/top-items', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // Simple in-memory aggregation across all orders
    const orders = await Order.find({ status: { $nin: ['cancelled','refunded'] } });
    const counts = {};
    (Array.isArray(orders) ? orders : []).forEach(order => {
      (order.items || []).forEach(item => {
        counts[item.name] = (counts[item.name] || 0) + (item.qty || 1);
      });
    });
    const top = Object.entries(counts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    res.json({ items: top });
  } catch (_) {
    res.json({ items: [] });
  }
});

export default router;
