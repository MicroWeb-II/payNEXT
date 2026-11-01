const bcrypt = require('bcryptjs');
const validator = require('validator');
const config = require('../config/env');
const userModel = require('../models/userModel');
const walletModel = require('../models/walletModel');
const audit = require('../models/auditModel');
const refreshTokens = require('../services/refreshTokenService');
const { withTransaction } = require('../services/moneyService');
const { signToken } = require('../middleware/auth');
const { ApiError } = require('../lib/errors');

const REFRESH_COOKIE = 'paynext_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
// Compared against when the email is unknown so response timing does not
// reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('paynext-timing-equaliser', config.auth.bcryptCost);

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

function sessionPayload(user, extra = {}) {
  return {
    user,
    ...extra,
    token: signToken(user),
    tokenType: 'Bearer',
    expiresIn: config.auth.accessTokenTtlSeconds,
  };
}

function publicUser(user) {
  if (!user) return user;
  const { password_hash: _passwordHash, ...safe } = user;
  return safe;
}

/**
 * Accounts created before emails were stored as lower-cased input were stored
 * with validator's normalizeEmail (which, for example, strips dots in Gmail
 * addresses). Look those up too so existing users can still sign in.
 */
async function findUserByEmail(email, db) {
  const user = await userModel.findByEmail(email, db);
  if (user) return user;
  const legacy = validator.normalizeEmail(email);
  return legacy && legacy !== email ? userModel.findByEmail(legacy, db) : undefined;
}

const register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone } = req.validated;
    const ctx = audit.contextFrom(req);
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptCost);

    const { user, wallet, refresh } = await withTransaction(async (client) => {
      if (await findUserByEmail(email, client)) throw new ApiError('Email already registered', 409);
      let created;
      try {
        created = await userModel.create({ email, passwordHash, fullName, phone }, client);
      } catch (error) {
        if (error.code === '23505') throw new ApiError('Email already registered', 409);
        throw error;
      }
      const newWallet = await walletModel.create(created.id, 'USD', client);
      const token = await refreshTokens.issue(created.id, { ip: ctx.ip, userAgent: ctx.userAgent }, client);
      await audit.log({
        ...ctx,
        actorUserId: created.id,
        action: 'register',
        entityType: 'user',
        entityId: created.id,
        metadata: { walletId: newWallet.id },
      }, client);
      return { user: created, wallet: newWallet, refresh: token };
    });

    setRefreshCookie(res, refresh.token);
    return res.status(201).json({
      success: true,
      message: 'Registered successfully',
      data: sessionPayload(user, { wallet }),
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const ctx = audit.contextFrom(req);
    const user = await findUserByEmail(email);
    const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !passwordOk) {
      await audit.log({
        ...ctx,
        actorUserId: user?.id || null,
        action: 'login_failure',
        entityType: 'user',
        entityId: user?.id || null,
        metadata: { reason: user ? 'wrong_password' : 'unknown_email', email },
      });
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      await audit.log({
        ...ctx,
        actorUserId: user.id,
        action: 'login_failure',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: `account_${user.status}` },
      });
      return res.status(403).json({ success: false, error: `Account is ${user.status}` });
    }

    const refresh = await refreshTokens.issue(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
    await audit.log({ ...ctx, actorUserId: user.id, action: 'login_success', entityType: 'user', entityId: user.id });

    setRefreshCookie(res, refresh.token);
    return res.json({ success: true, message: 'Login successful', data: sessionPayload(publicUser(user)) });
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const ctx = audit.contextFrom(req);
    const presented = req.cookies?.[REFRESH_COOKIE];
    const rotated = await withTransaction((client) =>
      refreshTokens.rotate(client, presented, { ip: ctx.ip, userAgent: ctx.userAgent }));

    if (rotated.reuseDetected) {
      clearRefreshCookie(res);
      await audit.log({
        ...ctx,
        actorUserId: rotated.userId,
        action: 'refresh_token_reuse',
        entityType: 'user',
        entityId: rotated.userId,
        metadata: { familyId: rotated.familyId },
      });
      return res.status(401).json({ success: false, error: 'Session revoked; please sign in again' });
    }

    const user = await userModel.findById(rotated.userId);
    if (!user || user.status !== 'active') {
      await refreshTokens.revokeFamily(rotated.familyId, 'account_inactive');
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, error: 'Session is no longer valid' });
    }

    setRefreshCookie(res, rotated.token);
    return res.json({ success: true, data: sessionPayload(user) });
  } catch (error) {
    if (error.status === 401) clearRefreshCookie(res);
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const revoked = await refreshTokens.revokeByToken(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    if (revoked) {
      await audit.log({
        ...audit.contextFrom(req),
        actorUserId: revoked.user_id,
        action: 'logout',
        entityType: 'user',
        entityId: revoked.user_id,
      });
    }
    return res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    return next(error);
  }
};

/** Fresh, database-backed profile (never the JWT payload). */
const me = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user) return res.status(401).json({ success: false, error: 'Account no longer exists' });
    return res.json({ success: true, data: user });
  } catch (error) {
    return next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await userModel.findAll({ limit: req.query.limit || 100, offset: req.query.offset || 0 });
    return res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  getAllUsers,
  REFRESH_COOKIE,
};
