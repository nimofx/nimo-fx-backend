const jwt = require("jsonwebtoken");
const User = require("../models/User");

// 🔐 USER PROTECT
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing"
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

// 🔥 ADMIN ONLY (UPDATED)
const adminOnly = (req, res, next) => {
  const isAdmin =
    req.user?.role === "admin" ||
    (Array.isArray(req.user?.roles) && req.user.roles.includes("admin"));

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only"
    });
  }

  next();
};

module.exports = { protect, adminOnly };