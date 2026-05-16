import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'user.register', 'user.login', 'user.logout', 'user.login_failed',
      'user.password_reset', 'user.deleted', 'user.updated',
      'order.created', 'order.status_changed', 'order.cancelled', 'order.refunded',
      'payment.intent_created', 'payment.succeeded', 'payment.failed', 'payment.refunded',
      'menu.item_toggled', 'menu.item_created', 'menu.item_updated',
      'admin.login', 'admin.login_failed', 'admin.data_export',
      'cookie.consent_given', 'cookie.consent_withdrawn',
      'data.anonymized', 'data.deleted',
    ]
  },
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    role: String,
    ip: String,
    userAgent: String,
  },
  target: {
    type: String,
    id: String,
  },
  metadata: { type: mongoose.Schema.Types.Mixed },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  // Retention: logs auto-purge after 90 days
  retainUntil: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ 'actor.userId': 1 });

export default mongoose.model('AuditLog', auditLogSchema);
