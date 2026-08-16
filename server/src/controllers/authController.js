const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");
const walletModel = require("../models/walletModel");
const { signToken } = require("../middleware/auth");

const register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone } = req.body;
    if (!email || !password || !fullName)
      return res.status(400).json({ success: false, error: "email, password and fullName are required" });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });

    const existing = await userModel.findByEmail(email.toLowerCase());
    if (existing)
      return res.status(409).json({ success: false, error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userModel.create({
      email: email.toLowerCase(),
      passwordHash,
      fullName,
      phone,
    });

    const wallet = await walletModel.create(user.id, "USD");
    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: "Registered successfully",
      data: { user, wallet, token },
    });
  } catch (e) {
    next(e);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findByEmail((email || "").toLowerCase());
    if (!user)
      return res.status(401).json({ success: false, error: "Invalid credentials" });

    const ok = await bcrypt.compare(password || "", user.password_hash);
    if (!ok)
      return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ success: true, message: "Login successful", data: { user: safeUser, token } });
  } catch (e) {
    next(e);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

module.exports = { register, login, me };
