import mongoose from 'mongoose';
import crypto from 'crypto';

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  qty: { type: Number, required: true, min: 1 },
  icon: String,
  subtotal: { type: Number, required: true, min: 0 },
}, { _id: false });

/**
 * Generate a collision-resistant order reference.
 * Uses 8 random bytes (64 bits of entropy) encoded as hex → uppercase.
 * Format: ORD-A1B2C3D4E5F6G7H8
 */
function generateOrderRef() {
  return 'ORD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function generateInvoiceNumber() {
  return 'INV-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

const orderSchema = new mongoose.Schema({
  orderRef: {
    type: String,
    unique: true,
    default: generateOrderRef,
  },
  customer: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    phone: String,
    email: String,
    isGuest: { type: Boolean, default: true },
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  loyaltyDiscount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  type: {
    type: String,
    enum: ['dine-in', 'takeaway', 'delivery'],
    required: true
  },
  tableNumber: String,
  deliveryAddress: String,
  notes: String,

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: String
  }],

  payment: {
    method: { type: String, enum: ['cash', 'card', 'stripe', 'loyalty'] },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    stripePaymentIntentId: String,
    stripeChargeId: String,
    paidAt: Date,
    refundedAt: Date,
    refundAmount: Number,
  },

  // Billing
  invoice: {
    invoiceNumber: String,
    issuedAt: Date,
    vatRate: { type: Number, default: 0.14 }, // 14% VAT Egypt
    vatAmount: Number,
    totalWithVat: Number,
  },

  // Data retention
  anonymizedAt: Date,
  isAnonymized: { type: Boolean, default: false },

}, { timestamps: true });

// Auto-generate invoice on creation
orderSchema.pre('save', function (next) {
  if (this.isNew && !this.invoice?.invoiceNumber) {
    const vat = this.total * 0.14;
    this.invoice = {
      invoiceNumber: generateInvoiceNumber(),
      issuedAt: new Date(),
      vatRate: 0.14,
      vatAmount: parseFloat(vat.toFixed(2)),
      totalWithVat: parseFloat((this.total + vat).toFixed(2)),
    };
  }
  next();
});

orderSchema.index({ 'customer.userId': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'payment.stripePaymentIntentId': 1 }, { sparse: true });
orderSchema.index({ 'payment.stripeChargeId': 1 }, { sparse: true });
orderSchema.index({ orderRef: 1 });

export default mongoose.model('Order', orderSchema);
