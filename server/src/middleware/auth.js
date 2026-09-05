const jwt = require("jsonwebtoken");

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token)
    return res.status(401).json({ success: false, error: "Missing token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ success: false, error: "Forbidden: insufficient permissions" });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
