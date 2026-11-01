const jwt = require('jsonwebtoken');
const config = require('../config/env');
const userModel = require('../models/userModel');

const ALGORITHM = 'HS256';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, typ: 'access' },
    config.auth.jwtSecret,
    {
      algorithm: ALGORITHM,
      expiresIn: config.auth.accessTokenTtlSeconds,
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
    },
  );
}

function verifyToken(token) {
  const payload = jwt.verify(token, config.auth.jwtSecret, {
    algorithms: [ALGORITHM],
    issuer: config.auth.jwtIssuer,
    audience: config.auth.jwtAudience,
  });
  if (payload.typ !== 'access' || !payload.sub) throw new Error('Not an access token');
  return payload;
}

function unauthorized(res, error) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json({ success: false, error });
}

/**
 * Authenticate a bearer access token and load the user from the database, so
 * role changes and suspensions apply immediately rather than when the token
 * expires. Sets `req.user` to { sub, email, role, status, fullName }.
 */
async function requireAuth(req, res, next) {
  const header = req.get ? req.get('Authorization') : req.headers?.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return unauthorized(res, 'Missing token');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return unauthorized(res, 'Invalid or expired token');
  }

  try {
    const user = await userModel.findById(payload.sub);
    if (!user) return unauthorized(res, 'Account no longer exists');
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: `Account is ${user.status}` });
    }
    req.user = { sub: user.id, email: user.email, role: user.role, status: user.status, fullName: user.full_name };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: insufficient permissions' });
    }
    return next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
