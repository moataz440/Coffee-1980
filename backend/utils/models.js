/**
 * Model proxy — transparently switches between Mongoose models (MongoDB mode)
 * and MemoryCollection instances (demo mode, no MongoDB).
 *
 * Usage in routes: import { User, Order, MenuItem, AuditLog } from '../utils/models.js'
 */

const DEMO = !process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '';

let User, Order, MenuItem, AuditLog;

if (DEMO) {
  const { MemoryCollection } = await import('./memoryStore.js');
  User      = new MemoryCollection('user');
  Order     = new MemoryCollection('order');
  MenuItem  = new MemoryCollection('menuitem');
  AuditLog  = new MemoryCollection('auditlog');
} else {
  const [U, O, M, A] = await Promise.all([
    import('../models/User.js'),
    import('../models/Order.js'),
    import('../models/MenuItem.js'),
    import('../models/AuditLog.js'),
  ]);
  User     = U.default;
  Order    = O.default;
  MenuItem = M.default;
  AuditLog = A.default;
}

export { User, Order, MenuItem, AuditLog, DEMO };
