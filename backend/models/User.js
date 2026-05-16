import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  role: {
    type: String,
    enum: ['customer', 'admin', 'staff'],
    default: 'customer'
  },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // Stripe billing
  stripeCustomerId: { type: String, select: false },
  subscription: {
    plan: { type: String, enum: ['free', 'loyalty', 'vip'], default: 'free' },
    status: { type: String, enum: ['active', 'inactive', 'cancelled'], default: 'inactive' },
    currentPeriodEnd: Date,
    stripeSubscriptionId: String,
  },

  // Loyalty points
  loyaltyPoints: { type: Number, default: 0 },
  totalSpend: { type: Number, default: 0 },

  // Auth tokens
  refreshTokens: [{ type: String, select: false }],
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerificationToken: { type: String, select: false },

  // Preferences & Consent
  cookieConsent: { type: Boolean, default: false },
  cookieConsentDate: Date,
  marketingOptIn: { type: Boolean, default: false },
  dataRetentionConsent: { type: Boolean, default: true },

  // Timestamps
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.passwordResetToken;
      delete ret.emailVerificationToken;
      return ret;
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Add loyalty points on purchase
userSchema.methods.addLoyaltyPoints = function (orderTotal) {
  this.loyaltyPoints += Math.floor(orderTotal / 10); // 1 point per 10 EGP
  this.totalSpend += orderTotal;

  // Auto-upgrade tier
  if (this.totalSpend >= 5000) this.subscription.plan = 'vip';
  else if (this.totalSpend >= 1000) this.subscription.plan = 'loyalty';
};

// Indexes (email is already indexed via unique:true on the field definition)
userSchema.index({ stripeCustomerId: 1 });
userSchema.index({ role: 1 });

export default mongoose.model('User', userSchema);
