import express from 'express';
import { MenuItem, AuditLog } from '../utils/models.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validate, createMenuItemSchema, updateMenuItemSchema } from '../config/validation.js';

const router = express.Router();

// GET /api/menu — public
router.get('/', async (req, res) => {
  const { category, featured } = req.query;
  const filter = { isAvailable: true };
  if (category) {
    if (!['espresso','cold','specialty','food','extras'].includes(category))
      throw new AppError('Invalid category', 400);
    filter.category = category;
  }
  if (featured === 'true') filter.isFeatured = true;
  const items = await MenuItem.find(filter).sort({ sortOrder: 1, name: 1 });
  res.json({ items });
});

// GET /api/menu/all — admin/staff
router.get('/all', authenticateToken, requireRole('admin','staff'), async (req, res) => {
  const items = await MenuItem.find({}).sort({ category: 1, sortOrder: 1 });
  res.json({ items });
});

// POST /api/menu
router.post('/', authenticateToken, requireRole('admin'), validate(createMenuItemSchema), async (req, res) => {
  const item = await MenuItem.create(req.body);
  try { await AuditLog.create({ action: 'menu.item_created', actor: { userId: req.user._id, email: req.user.email, ip: req.ip }, target: { type: 'MenuItem', id: item._id.toString() }, metadata: { name: item.name } }); } catch (_) {}
  res.status(201).json({ item });
});

// PATCH /api/menu/:id
router.patch('/:id', authenticateToken, requireRole('admin'), validate(updateMenuItemSchema), async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!item) throw new AppError('Menu item not found', 404);
  res.json({ item });
});

// PATCH /api/menu/:id/toggle
router.patch('/:id/toggle', authenticateToken, requireRole('admin','staff'), async (req, res) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) throw new AppError('Menu item not found', 404);
  item.isAvailable = !item.isAvailable;
  await item.save();
  res.json({ item });
});

// DELETE /api/menu/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const item = await MenuItem.findByIdAndDelete(req.params.id);
  if (!item) throw new AppError('Menu item not found', 404);
  res.json({ message: 'Menu item deleted' });
});

export default router;
