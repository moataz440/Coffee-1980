# ☕ 1980 Coffee — Full-Stack Web Application

A complete coffee shop ordering system with a customer-facing menu, real-time order management, admin dashboard, analytics, loyalty points, and optional Stripe payments.

---

## 🚀 Quick Start (No MongoDB needed)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Open .env and fill in your JWT secrets (see below)

# 3. Start the server
npm start
```

Open **http://localhost:5000** in your browser.

**Demo credentials:**
- Email: `admin@1980coffee.com`
- Password: `Admin1234`

---

## ⚙️ Environment Setup

### Generate JWT Secrets (required)
```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into your `.env` file.

### Demo Mode (default)
Leave `MONGODB_URI=` empty — the app runs with an **in-memory database** seeded with:
- 12 menu items across all categories
- 1 admin user (`admin@1980coffee.com` / `Admin1234`)

> ⚠️ Data resets every time you restart the server in demo mode.

### Production Mode (MongoDB Atlas)
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/1980coffee
```

---

## 📋 Features

| Feature | Status |
|---------|--------|
| Customer menu (EN + AR) | ✅ |
| Cart & order placement | ✅ |
| Order types: dine-in, takeaway, delivery | ✅ |
| Guest + authenticated orders | ✅ |
| Loyalty points system | ✅ |
| Admin dashboard | ✅ |
| Order status management | ✅ |
| Menu CRUD | ✅ |
| Analytics & KPIs | ✅ |
| JWT auth (access + refresh tokens) | ✅ |
| Audit logs | ✅ |
| Stripe card payments | Optional |
| MongoDB persistence | Optional |

---

## 🗂 Project Structure

```
Coffee-1980/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── config/
│   │   ├── env.js             # Environment validation
│   │   └── validation.js      # Joi schemas
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   └── errorHandler.js    # Global error handler
│   ├── models/                # Mongoose schemas (used when MongoDB is set)
│   │   ├── User.js
│   │   ├── Order.js
│   │   ├── MenuItem.js
│   │   └── AuditLog.js
│   ├── routes/
│   │   ├── auth.js            # /api/auth/*
│   │   ├── orders.js          # /api/orders/*
│   │   ├── menu.js            # /api/menu/*
│   │   ├── payments.js        # /api/payments/*
│   │   ├── analytics.js       # /api/analytics/*
│   │   └── admin.js           # /api/admin/*
│   └── utils/
│       ├── models.js          # Model proxy (Mongoose ↔ in-memory)
│       ├── memoryStore.js     # In-memory database for demo mode
│       ├── logger.js          # Winston logging
│       └── dataRetention.js   # GDPR data cleanup jobs
├── frontend/
│   └── index.html             # Single-page app (served by backend)
├── analytics/
│   └── dashboard.py           # Python analytics dashboard
├── scripts/
│   └── seed.js                # MongoDB seed script
├── .env                       # Your local config (git-ignored)
├── .env.example               # Template
└── package.json
```

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT cookies) |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/me` | Update profile |
| POST | `/api/auth/change-password` | Change password |

### Menu (public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu` | All available items |
| GET | `/api/menu?category=espresso` | Filter by category |
| GET | `/api/menu?featured=true` | Featured items only |
| POST | `/api/menu` | Create item (admin) |
| PATCH | `/api/menu/:id` | Update item (admin) |
| PATCH | `/api/menu/:id/toggle` | Toggle availability (admin/staff) |
| DELETE | `/api/menu/:id` | Delete item (admin) |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place order (guest or auth) |
| GET | `/api/orders` | All orders (admin/staff) |
| GET | `/api/orders/my` | My orders (auth) |
| GET | `/api/orders/:id` | Get order by ID |
| PATCH | `/api/orders/:id/status` | Update status (admin/staff) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/:id` | Update user (role, status) |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/audit-logs` | View audit trail |
| GET | `/api/admin/stats` | Quick stats |

### Analytics (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | KPI dashboard |
| GET | `/api/analytics/revenue-chart` | 30-day revenue |
| GET | `/api/analytics/top-items` | Best sellers |

### Health
```
GET /api/health
```

---

## 🛠 Development

```bash
npm run dev      # Start with nodemon (auto-reload)
npm start        # Production start
npm run seed     # Seed MongoDB with sample data
```

### Requirements
- Node.js ≥ 18
- MongoDB Atlas (optional — demo mode works without it)
- Stripe account (optional — cash payments work without it)

---

## 🔒 Security

- Passwords hashed with **bcrypt** (10 rounds)
- JWT access tokens (15 min) + refresh tokens (7 days) via **httpOnly cookies**
- Token rotation on refresh + reuse detection
- Rate limiting on all API routes (stricter on auth)
- Helmet security headers
- Input validation with Joi on all endpoints
- GDPR-style data retention (guest orders anonymized after 1 year)
- Audit log for all sensitive actions

---

## 📦 Stripe Payments

To enable card payments:

1. Create an account at [stripe.com](https://stripe.com)
2. Get your API keys from the dashboard
3. Add to `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. For webhooks: `stripe listen --forward-to localhost:5000/api/payments/webhook`

Cash, card (manual), and loyalty point payments all work without Stripe.

---

## 📊 Python Analytics Dashboard

```bash
npm run analytics
# or on Windows:
npm run analytics:win
```

Requires: Python 3.8+ and MongoDB connection.

---

Made with ☕ by 1980 Coffee
