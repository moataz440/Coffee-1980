import Joi from 'joi';

// ─── Auth ────────────────────────────────────────────────────────────────────

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
  phone: Joi.string().trim().pattern(/^[+\d\s\-().]{7,20}$/).optional().allow(''),
  cookieConsent: Joi.boolean().optional(),
  marketingOptIn: Joi.boolean().optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).optional(),
  phone: Joi.string().trim().pattern(/^[+\d\s\-().]{7,20}$/).optional().allow(''),
  marketingOptIn: Joi.boolean().optional(),
});

// ─── Orders ──────────────────────────────────────────────────────────────────

const orderItemSchema = Joi.object({
  menuItemId: Joi.string().optional(),
  name: Joi.string().required(),
  price: Joi.number().min(0).required(),
  qty: Joi.number().integer().min(1).max(50).required(),
  icon: Joi.string().optional().allow(''),
  subtotal: Joi.number().optional(), // server recalculates anyway
});

export const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).max(30).required(),
  type: Joi.string().valid('dine-in', 'takeaway', 'delivery').required(),
  tableNumber: Joi.string().max(10).optional().allow(''),
  deliveryAddress: Joi.string().max(300).optional().allow(''),
  notes: Joi.string().max(500).optional().allow(''),
  customerInfo: Joi.object({
    name: Joi.string().trim().max(80).optional(),
    phone: Joi.string().trim().max(20).optional(),
    email: Joi.string().email().optional(),
  }).optional(),
  paymentMethod: Joi.string().valid('cash', 'card', 'stripe', 'loyalty').required(),
  usePoints: Joi.boolean().optional(),
});

export const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded')
    .required(),
});

// ─── Menu ────────────────────────────────────────────────────────────────────

export const createMenuItemSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  nameAr: Joi.string().trim().max(100).optional().allow(''),
  description: Joi.string().max(500).optional().allow(''),
  descriptionAr: Joi.string().max(500).optional().allow(''),
  icon: Joi.string().max(10).optional().allow(''),
  price: Joi.number().min(0).max(10000).required(),
  category: Joi.string().valid('espresso', 'cold', 'specialty', 'food', 'extras').required(),
  isAvailable: Joi.boolean().optional(),
  isFeatured: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  allergens: Joi.array().items(Joi.string()).optional(),
  calories: Joi.number().integer().min(0).optional(),
  preparationTime: Joi.number().integer().min(0).max(120).optional(),
  sortOrder: Joi.number().integer().optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.fork(
  ['name', 'price', 'category'],
  field => field.optional()
);

// ─── Payments ────────────────────────────────────────────────────────────────

export const createPaymentIntentSchema = Joi.object({
  orderId: Joi.string().required(),
  currency: Joi.string().valid('egp', 'usd', 'eur').default('egp'),
});

export const refundSchema = Joi.object({
  orderId: Joi.string().required(),
  reason: Joi.string().valid('duplicate', 'fraudulent', 'requested_by_customer').default('requested_by_customer'),
});

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against the given schema.
 * On failure, responds 400 with a clear message. On success, replaces req.body
 * with the Joi-coerced (trimmed, defaulted) value.
 */
export function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const message = error.details.map(d => d.message).join('; ');
      return res.status(400).json({ error: message });
    }
    req.body = value;
    next();
  };
}
