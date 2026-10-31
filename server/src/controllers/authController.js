const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const walletModel = require('../models/walletModel');
const { signToken } = require('../middleware/auth');
const audit = require('../models/auditModel');

const BCRYPT_COST = 12;
const PASSWORD_MIN_LEN = 8;
const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/;

const register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone } = req.body;

    if (!email || !password || !fullName)
      return res.status(400).json({ success: false, error: 'email, password and fullName are required' });

    if (password.length < PASSWORD_MIN_LEN || !PASSWORD_PATTERN.test(password))
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters and contain at least one letter and one number',
      });

    const existing = await userModel.findByEmail(email.toLowerCase());
    if (existing)
      return res.status(409).json({ success: false, error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await userModel.create({ email: email.toLowerCase(), passwordHash, fullName, phone });
    const wallet = await walletModel.create(user.id, 'USD');
    const token = signToken(user);

    await audit.log({
      actorUserId: user.id,
      action: 'register',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Registered successfully', data: { user, wallet, token } });
  } catch (e) {
    next(e);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findByEmail((email || '').toLowerCase());

    if (!user) {
      await audit.log({
        actorUserId: null,
        action: 'login_failure',
        entityType: 'user',
        metadata: { email, reason: 'user_not_found' },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password || '', user.password_hash);
    if (!ok) {
      await audit.log({
        actorUserId: user.id,
        action: 'login_failure',
        entityType: 'user',
        entityId: user.id,
        metadata: { email, reason: 'wrong_password' },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    await audit.log({
      actorUserId: user.id,
      action: 'login_success',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Login successful', data: { user: safeUser, token } });
  } catch (e) {
    next(e);
  }
};

const me = async (req, res, next) => {
  try {
    // Always re-fetch from DB to return fresh, accurate user data (not stale JWT payload)
    const userId = req.user && req.user.sub;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await userModel.findById(userId);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });

    res.status(200).json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await userModel.findAll();
    res.json({ success: true, data: users });
  } catch (e) {
    next(e);
  }
};

module.exports = { register, login, me, getAllUsers };
