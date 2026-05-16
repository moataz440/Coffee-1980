/**
 * Seed script — populates MongoDB with initial menu items and admin user.
 * Run: node scripts/seed.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import MenuItem from '../backend/models/MenuItem.js';
import User from '../backend/models/User.js';

const MENU_ITEMS = [
  // Espresso
  { name: 'Espresso', nameAr: 'إسبريسو', icon: '☕', price: 35, category: 'espresso', sortOrder: 1, description: 'Double shot, pure and intense' },
  { name: 'Americano', nameAr: 'أمريكانو', icon: '☕', price: 45, category: 'espresso', sortOrder: 2 },
  { name: 'Cappuccino', nameAr: 'كابتشينو', icon: '☕', price: 55, category: 'espresso', sortOrder: 3 },
  { name: 'Flat White', nameAr: 'فلات وايت', icon: '☕', price: 60, category: 'espresso', sortOrder: 4 },
  { name: 'Latte', nameAr: 'لاتيه', icon: '🥛', price: 60, category: 'espresso', sortOrder: 5 },
  { name: 'Cortado', nameAr: 'كورتادو', icon: '☕', price: 50, category: 'espresso', sortOrder: 6 },
  { name: 'Macchiato', nameAr: 'ماكياتو', icon: '☕', price: 50, category: 'espresso', sortOrder: 7 },
  { name: 'Turkish Coffee', nameAr: 'قهوة تركية', icon: '🫖', price: 40, category: 'espresso', sortOrder: 8, isFeatured: true },
  // Cold
  { name: 'Cold Brew', nameAr: 'كولد برو', icon: '🧊', price: 70, category: 'cold', sortOrder: 1 },
  { name: 'Iced Latte', nameAr: 'لاتيه بارد', icon: '🧊', price: 65, category: 'cold', sortOrder: 2 },
  { name: 'Frappuccino', nameAr: 'فرابتشينو', icon: '🥤', price: 75, category: 'cold', sortOrder: 3 },
  { name: 'Nitro Cold Brew', nameAr: 'نيترو', icon: '🧊', price: 85, category: 'cold', sortOrder: 4, isFeatured: true },
  // Specialty
  { name: 'Saffron Latte', nameAr: 'لاتيه زعفران', icon: '🌿', price: 90, category: 'specialty', sortOrder: 1, isFeatured: true },
  { name: 'Rose Water Latte', nameAr: 'لاتيه ماء الورد', icon: '🌹', price: 85, category: 'specialty', sortOrder: 2 },
  { name: 'Cardamom Coffee', nameAr: 'قهوة هيل', icon: '🫖', price: 65, category: 'specialty', sortOrder: 3 },
  // Food
  { name: 'Croissant', nameAr: 'كرواسون', icon: '🥐', price: 45, category: 'food', sortOrder: 1 },
  { name: 'Cheesecake', nameAr: 'تشيزكيك', icon: '🍰', price: 65, category: 'food', sortOrder: 2 },
  { name: 'Almond Biscotti', nameAr: 'بسكوتي لوز', icon: '🍪', price: 35, category: 'food', sortOrder: 3 },
  // Extras
  { name: 'Extra Shot', nameAr: 'شوت إضافي', icon: '⚡', price: 15, category: 'extras', sortOrder: 1 },
  { name: 'Oat Milk', nameAr: 'حليب شوفان', icon: '🌾', price: 15, category: 'extras', sortOrder: 2 },
  { name: 'Vanilla Syrup', nameAr: 'شراب فانيلا', icon: '🍦', price: 10, category: 'extras', sortOrder: 3 },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB Atlas');

    // Clear existing
    await MenuItem.deleteMany({});
    await User.deleteMany({ role: { $in: ['admin', 'staff'] } });

    // Seed menu
    const items = await MenuItem.insertMany(MENU_ITEMS);
    console.log(`✓ Seeded ${items.length} menu items`);

    // Seed admin
    const admin = await User.create({
      name: '1980 Admin',
      email: process.env.ADMIN_EMAIL || 'admin@1980coffee.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@1980!',
      role: 'admin',
      isVerified: true,
      cookieConsent: true,
    });
    console.log(`✓ Admin created: ${admin.email}`);
    console.log('\n🚀 Seeding complete!');

  } catch (err) {
    console.error('Seeding failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
