import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: String,
  description: String,
  descriptionAr: String,
  icon: String,
  price: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    enum: ['espresso', 'cold', 'specialty', 'food', 'extras'],
    required: true
  },
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  tags: [String],
  allergens: [String],
  calories: Number,
  preparationTime: { type: Number, default: 5 }, // minutes
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

menuItemSchema.index({ category: 1, isAvailable: 1 });

export default mongoose.model('MenuItem', menuItemSchema);
