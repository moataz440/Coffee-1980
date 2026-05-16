/**
 * In-memory database for demo/development mode (no MongoDB required).
 * Mimics the Mongoose model API: find, findOne, findById,
 * findByIdAndUpdate, create, countDocuments, updateMany, deleteMany, aggregate.
 * Supports .select(), .sort(), .limit(), .skip(), .lean(), .populate() chains.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ─── Shared in-memory collections ────────────────────────────────
const _store = {
  users: [],
  menuitems: [],
  orders: [],
  auditlogs: [],
};

function _col(name) {
  const key = name.toLowerCase().replace(/s$/, '') + 's'; // normalize
  const map = {
    users: 'users',
    menuitems: 'menuitems',
    orders: 'orders',
    auditlogs: 'auditlogs',
    auditlog: 'auditlogs',
    menuitem: 'menuitems',
    order: 'orders',
    user: 'users',
  };
  return _store[map[key] || key] || [];
}

function _id() {
  return crypto.randomBytes(12).toString('hex');
}

function generateOrderRef() {
  return 'ORD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function generateInvoiceNumber() {
  return 'INV-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

// Simple filter matching
function _matches(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  return Object.entries(filter).every(([key, val]) => {
    if (key === '$or') return val.some(f => _matches(doc, f));
    if (key === '$and') return val.every(f => _matches(doc, f));
    if (key === '$nin') return !val.includes(_get(doc, key));

    const docVal = _get(doc, key);

    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.entries(val).every(([op, opVal]) => {
        if (op === '$regex') {
          const flags = val.$options || '';
          return new RegExp(opVal, flags).test(docVal ?? '');
        }
        if (op === '$options') return true;
        if (op === '$gte') return docVal >= opVal;
        if (op === '$lte') return docVal <= opVal;
        if (op === '$gt') return docVal > opVal;
        if (op === '$lt') return docVal < opVal;
        if (op === '$ne') return docVal !== opVal;
        if (op === '$in') return opVal.includes(docVal);
        if (op === '$nin') return !opVal.includes(docVal);
        return false;
      });
    }

    if (Array.isArray(docVal)) return docVal.includes(val);
    return docVal === val;
  });
}

function _get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function _set(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (o[k] == null) o[k] = {};
    return o[k];
  }, obj);
  target[last] = val;
}

function _applyUpdate(doc, update) {
  const { $set, $inc, $push, $pull, $unset } = update;
  if ($set) Object.entries($set).forEach(([k, v]) => _set(doc, k, v));
  if ($inc) Object.entries($inc).forEach(([k, v]) => {
    const cur = _get(doc, k) ?? 0;
    _set(doc, k, cur + v);
  });
  if ($push) Object.entries($push).forEach(([k, v]) => {
    const arr = _get(doc, k) ?? [];
    arr.push(v);
    _set(doc, k, arr);
  });
  if ($pull) Object.entries($pull).forEach(([k, v]) => {
    const arr = _get(doc, k) ?? [];
    _set(doc, k, arr.filter(item => item !== v));
  });
  if ($unset) Object.entries($unset).forEach(([k]) => _set(doc, k, undefined));
  // Plain updates (no operator)
  const plain = Object.fromEntries(
    Object.entries(update).filter(([k]) => !k.startsWith('$'))
  );
  if (Object.keys(plain).length) Object.assign(doc, plain);
}

function _sortDocs(docs, sortObj) {
  if (!sortObj) return docs;
  const entries = typeof sortObj === 'string'
    ? [[sortObj.replace(/^-/, ''), sortObj.startsWith('-') ? -1 : 1]]
    : Object.entries(sortObj);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      const av = _get(a, key);
      const bv = _get(b, key);
      if (av < bv) return -dir;
      if (av > bv) return dir;
    }
    return 0;
  });
}

// ─── Wrap doc as Mongoose-like instance ──────────────────────────
function _wrap(collection, colName, doc) {
  const obj = { ...doc };

  obj.toJSON = () => {
    const out = { ...obj };
    delete out.password;
    delete out.refreshTokens;
    delete out.passwordResetToken;
    delete out.emailVerificationToken;
    return out;
  };

  obj.toObject = () => ({ ...obj });

  obj.save = async () => {
    const idx = collection.findIndex(d => d._id === obj._id);
    // Copy all own properties back to the stored doc
    const fields = Object.keys(obj).filter(k => typeof obj[k] !== 'function');
    fields.forEach(k => { doc[k] = obj[k]; });
    if (idx >= 0) Object.assign(collection[idx], doc);
    return obj;
  };

  obj.comparePassword = async (pw) => {
    return bcrypt.compare(pw, obj.password);
  };

  obj.addLoyaltyPoints = (total) => {
    obj.loyaltyPoints = (obj.loyaltyPoints || 0) + Math.floor(total);
  };

  return obj;
}

// ─── Chainable query builder ──────────────────────────────────────
class Query {
  constructor(promise) {
    this._p = promise;
  }
  select() { return this; }
  populate() { return this; }
  lean() { return this; }
  sort(s) {
    this._p = this._p.then(res =>
      Array.isArray(res) ? _sortDocs(res, s) : res
    );
    return this;
  }
  limit(n) {
    this._p = this._p.then(res =>
      Array.isArray(res) ? res.slice(0, n) : res
    );
    return this;
  }
  skip(n) {
    this._p = this._p.then(res =>
      Array.isArray(res) ? res.slice(n) : res
    );
    return this;
  }
  then(resolve, reject) { return this._p.then(resolve, reject); }
  catch(reject) { return this._p.catch(reject); }
}

// ─── MemoryCollection ─────────────────────────────────────────────
class MemoryCollection {
  constructor(name) {
    this.name = name.toLowerCase();
  }

  _data() {
    const key = this.name + 's';
    if (!_store[key]) _store[key] = [];
    return _store[key];
  }

  find(filter = {}) {
    const data = this._data();
    return new Query(Promise.resolve(
      data.filter(d => _matches(d, filter)).map(d => _wrap(data, this.name, { ...d }))
    ));
  }

  findOne(filter = {}) {
    const data = this._data();
    const doc = data.find(d => _matches(d, filter));
    return new Query(Promise.resolve(
      doc ? _wrap(data, this.name, { ...doc }) : null
    ));
  }

  findById(id) {
    return this.findOne({ _id: String(id) });
  }

  async create(data) {
    const col = this._data();
    const doc = {
      _id: _id(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };

    // Run order-specific pre-save hooks
    if (this.name === 'order') {
      if (!doc.orderRef) doc.orderRef = generateOrderRef();
      if (!doc.invoice?.invoiceNumber) {
        const vat = doc.total * 0.14;
        doc.invoice = {
          invoiceNumber: generateInvoiceNumber(),
          issuedAt: new Date(),
          vatRate: 0.14,
          vatAmount: parseFloat(vat.toFixed(2)),
          totalWithVat: parseFloat((doc.total + vat).toFixed(2)),
        };
      }
    }

    // Hash password if user
    if (this.name === 'user' && doc.password && !doc.password.startsWith('$2')) {
      doc.password = await bcrypt.hash(doc.password, 10);
    }

    col.push(doc);
    return _wrap(col, this.name, { ...doc });
  }

  findByIdAndUpdate(id, update, opts = {}) {
    const data = this._data();
    const idx = data.findIndex(d => d._id === String(id));
    if (idx < 0) return new Query(Promise.resolve(null));
    _applyUpdate(data[idx], update);
    data[idx].updatedAt = new Date();
    const result = opts.new !== false ? _wrap(data, this.name, { ...data[idx] }) : null;
    return new Query(Promise.resolve(result));
  }

  findOneAndUpdate(filter, update, opts = {}) {
    const data = this._data();
    const idx = data.findIndex(d => _matches(d, filter));
    if (idx < 0) {
      if (opts.upsert) {
        return new Query(this.create({ ...filter, ...update.$set }));
      }
      return new Query(Promise.resolve(null));
    }
    _applyUpdate(data[idx], update);
    data[idx].updatedAt = new Date();
    const result = opts.new !== false ? _wrap(data, this.name, { ...data[idx] }) : null;
    return new Query(Promise.resolve(result));
  }

  findByIdAndDelete(id) {
    const data = this._data();
    const idx = data.findIndex(d => d._id === String(id));
    if (idx < 0) return new Query(Promise.resolve(null));
    const [doc] = data.splice(idx, 1);
    return new Query(Promise.resolve(_wrap(data, this.name, doc)));
  }

  async countDocuments(filter = {}) {
    return this._data().filter(d => _matches(d, filter)).length;
  }

  async updateMany(filter, update) {
    const data = this._data();
    let count = 0;
    data.forEach((doc, i) => {
      if (_matches(doc, filter)) {
        _applyUpdate(data[i], update);
        data[i].updatedAt = new Date();
        count++;
      }
    });
    return { modifiedCount: count };
  }

  async deleteMany(filter) {
    const data = this._data();
    const before = data.length;
    const keep = data.filter(d => !_matches(d, filter));
    _store[this.name + 's'] = keep;
    return { deletedCount: before - keep.length };
  }

  // Basic aggregate — just handles $match/$group/$sort/$limit used in analytics
  async aggregate(pipeline) {
    let docs = [...this._data()];

    for (const stage of pipeline) {
      if (stage.$match) {
        docs = docs.filter(d => _matches(d, stage.$match));
      } else if (stage.$group) {
        const groups = {};
        docs.forEach(doc => {
          const keyExpr = stage.$group._id;
          let key;
          if (typeof keyExpr === 'string' && keyExpr.startsWith('$')) {
            key = _get(doc, keyExpr.slice(1));
          } else if (keyExpr && typeof keyExpr === 'object') {
            // e.g. { $dateToString: { format: ..., date: '$createdAt' } }
            const dt = _get(doc, 'createdAt');
            key = dt ? new Date(dt).toISOString().split('T')[0] : 'unknown';
          } else {
            key = keyExpr;
          }

          if (!groups[key]) {
            groups[key] = { _id: key };
            Object.entries(stage.$group).forEach(([field, expr]) => {
              if (field === '_id') return;
              if (expr.$sum !== undefined) groups[key][field] = 0;
              if (expr.$avg !== undefined) { groups[key][field] = 0; groups[key]['__count_' + field] = 0; }
              if (expr.$first !== undefined) groups[key][field] = null;
              if (expr.$push !== undefined) groups[key][field] = [];
            });
          }

          Object.entries(stage.$group).forEach(([field, expr]) => {
            if (field === '_id') return;
            if (expr.$sum !== undefined) {
              const val = typeof expr.$sum === 'number' ? expr.$sum : _get(doc, expr.$sum.slice(1));
              groups[key][field] += (val || 0);
            }
            if (expr.$avg !== undefined) {
              const val = _get(doc, expr.$avg.slice(1));
              groups[key][field] += (val || 0);
              groups[key]['__count_' + field]++;
            }
            if (expr.$first !== undefined && groups[key][field] === null) {
              groups[key][field] = _get(doc, expr.$first.slice(1));
            }
            if (expr.$push !== undefined) {
              groups[key][field].push(expr.$push === '$$ROOT' ? doc : _get(doc, expr.$push.slice(1)));
            }
          });
        });

        // Finalize averages
        docs = Object.values(groups).map(g => {
          Object.keys(g).filter(k => k.startsWith('__count_')).forEach(k => {
            const field = k.replace('__count_', '');
            if (g['__count_' + field] > 0) g[field] /= g['__count_' + field];
            delete g[k];
          });
          return g;
        });
      } else if (stage.$sort) {
        docs = _sortDocs(docs, stage.$sort);
      } else if (stage.$limit) {
        docs = docs.slice(0, stage.$limit);
      } else if (stage.$project) {
        docs = docs.map(doc => {
          const out = {};
          Object.entries(stage.$project).forEach(([k, v]) => {
            if (v === 1 || v === true) out[k] = _get(doc, k);
            else if (typeof v === 'object') out[k] = doc._id; // simplified
          });
          return out;
        });
      }
    }

    return docs;
  }
}

// ─── Seed data ────────────────────────────────────────────────────
async function seedDemoData() {
  // Admin user
  await new MemoryCollection('user').create({
    name: 'Admin',
    email: 'admin@1980coffee.com',
    password: 'Admin1234',
    role: 'admin',
    isActive: true,
    loyaltyPoints: 0,
    loginCount: 0,
    cookieConsent: true,
    marketingOptIn: false,
  });

  // Menu items
  const menu = new MemoryCollection('menuitem');
  const items = [
    { name: 'Espresso', nameAr: 'إسبريسو', description: 'Rich double shot', icon: '☕', price: 25, category: 'espresso', isAvailable: true, isFeatured: true, sortOrder: 1 },
    { name: 'Cappuccino', nameAr: 'كابتشينو', description: 'Espresso with steamed milk foam', icon: '☕', price: 40, category: 'espresso', isAvailable: true, isFeatured: true, sortOrder: 2 },
    { name: 'Latte', nameAr: 'لاتيه', description: 'Smooth espresso with steamed milk', icon: '🥛', price: 45, category: 'espresso', isAvailable: true, isFeatured: false, sortOrder: 3 },
    { name: 'Americano', nameAr: 'أمريكانو', description: 'Espresso with hot water', icon: '☕', price: 35, category: 'espresso', isAvailable: true, isFeatured: false, sortOrder: 4 },
    { name: 'Cold Brew', nameAr: 'كولد برو', description: '24-hour steeped cold coffee', icon: '🧊', price: 55, category: 'cold', isAvailable: true, isFeatured: true, sortOrder: 5 },
    { name: 'Iced Latte', nameAr: 'لاتيه مثلج', description: 'Espresso over ice with cold milk', icon: '🧊', price: 50, category: 'cold', isAvailable: true, isFeatured: false, sortOrder: 6 },
    { name: 'Matcha Latte', nameAr: 'ماتشا لاتيه', description: 'Japanese matcha with oat milk', icon: '🍵', price: 65, category: 'specialty', isAvailable: true, isFeatured: true, sortOrder: 7 },
    { name: 'Cortado', nameAr: 'كورتادو', description: 'Equal espresso and steamed milk', icon: '☕', price: 45, category: 'espresso', isAvailable: true, isFeatured: false, sortOrder: 8 },
    { name: 'Croissant', nameAr: 'كرواسان', description: 'Buttery flaky French croissant', icon: '🥐', price: 35, category: 'food', isAvailable: true, isFeatured: false, sortOrder: 9 },
    { name: 'Avocado Toast', nameAr: 'توست أفوكادو', description: 'Sourdough with smashed avocado', icon: '🥑', price: 85, category: 'food', isAvailable: true, isFeatured: true, sortOrder: 10 },
    { name: 'Extra Shot', nameAr: 'شوت إضافي', description: 'Add an extra espresso shot', icon: '➕', price: 10, category: 'extras', isAvailable: true, isFeatured: false, sortOrder: 11 },
    { name: 'Oat Milk', nameAr: 'حليب الشوفان', description: 'Dairy-free oat milk substitute', icon: '🌾', price: 10, category: 'extras', isAvailable: true, isFeatured: false, sortOrder: 12 },
  ];
  for (const item of items) await menu.create(item);
}

await seedDemoData();

export { MemoryCollection };
