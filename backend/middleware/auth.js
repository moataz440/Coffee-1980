import jwt from 'jsonwebtoken';
import { User } from '../utils/models.js';
import { logger } from '../utils/logger.js';

export const authenticateToken = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
    else if (req.cookies?.accessToken) token = req.cookies.accessToken;

    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    logger.warn(`Auth failure: ${err.message}`);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken || req.headers['authorization']?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch (_) {}
  next();
};
