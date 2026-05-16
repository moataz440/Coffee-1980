import { AuditLog, Order } from './models.js';
import { logger } from './logger.js';

export async function purgeOldLogs() {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    logger.info(`Data retention: purged ${result.deletedCount} audit log entries`);
    return result.deletedCount;
  } catch (err) {
    logger.error('Data retention - log purge failed:', err.message);
    return 0;
  }
}

export async function anonymizeOldGuestOrders() {
  try {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const result = await Order.updateMany(
      { 'customer.isGuest': true, createdAt: { $lt: cutoff }, isAnonymized: { $ne: true } },
      { $set: {
          'customer.name': 'Guest [Anonymized]',
          'customer.phone': '***',
          'customer.email': '***',
          isAnonymized: true,
          anonymizedAt: new Date(),
        }
      }
    );
    logger.info(`Data retention: anonymized ${result.modifiedCount} guest orders`);
    return result.modifiedCount;
  } catch (err) {
    logger.error('Data retention - anonymize failed:', err.message);
    return 0;
  }
}
