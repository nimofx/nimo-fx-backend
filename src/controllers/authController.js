const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/User");

const OTP_EXPIRY_MINUTES = 60;

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
};

const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const getOtpExpiry = () => {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendOtpEmail = async (email, otp, purpose = "register") => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP email configuration missing");
  }

  const transporter = createTransporter();

  const subject =
    purpose === "forgot"
      ? "NIMO FX Password Reset OTP"
      : "NIMO FX Email Verification OTP";

  const title =
    purpose === "forgot"
      ? "Password Reset Verification"
      : "Email Verification";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
        <h2 style="margin: 0 0 10px; color: #111;">${title}</h2>
        <p style="color: #444;">Your OTP is:</p>
        <h1 style="letter-spacing: 6px; background: #111; color: #00c853; padding: 16px; border-radius: 10px; text-align: center;">
          ${otp}
        </h1>
        <p style="color: #555;">This OTP is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p style="font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
      </div>
    `
  });
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  roles: user.roles || ["user"],
  kycStatus: user.kycStatus,
  emailVerified: Boolean(user.emailVerified)
});

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!name || !cleanEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser && existingUser.emailVerified) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOtp();

    let user = existingUser;

    if (user) {
      user.name = name;
      user.phone = phone || user.phone;
      user.password = hashedPassword;
      user.emailVerified = false;
      user.otp = otp;
      user.otpPurpose = "register";
      user.otpExpires = getOtpExpiry();
      user.otpVerified = false;

      await user.save();
    } else {
      user = await User.create({
        name,
        email: cleanEmail,
        phone,
        password: hashedPassword,
        emailVerified: false,
        otp,
        otpPurpose: "register",
        otpExpires: getOtpExpiry(),
        otpVerified: false
      });
    }

    await sendOtpEmail(cleanEmail, otp, "register");

    res.status(201).json({
      success: true,
      message: "Registration successful. OTP sent to your email.",
      email: cleanEmail
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Registration failed"
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isAdmin = user.role === "admin" || user.roles?.includes("admin");

    if (!isAdmin && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. Please contact support."
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email not found"
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your registration OTP first"
      });
    }

    const otp = generateOtp();

    user.otp = otp;
    user.otpPurpose = "forgot";
    user.otpExpires = getOtpExpiry();
    user.otpVerified = false;

    await user.save();

    await sendOtpEmail(cleanEmail, otp, "forgot");

    res.json({
      success: true,
      message: "OTP sent to your email"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send OTP"
    });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!cleanEmail || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP."
      });
    }

    if (user.otpPurpose === "register") {
      user.emailVerified = true;
      user.otp = "";
      user.otpPurpose = "";
      user.otpExpires = null;
      user.otpVerified = false;

      await user.save();

      const token = generateToken(user._id);

      return res.json({
        success: true,
        message: "Email verified successfully",
        token,
        user: sanitizeUser(user)
      });
    }

    if (user.otpPurpose === "forgot") {
      user.otp = "";
      user.otpVerified = true;

      await user.save();

      return res.json({
        success: true,
        message: "OTP verified successfully"
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid OTP purpose"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "OTP verification failed"
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!cleanEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (
      user.otpPurpose !== "forgot" ||
      !user.otpVerified ||
      !user.otpExpires ||
      user.otpExpires < new Date()
    ) {
      return res.status(403).json({
        success: false,
        message: "Please verify OTP before resetting password"
      });
    }

    user.password = await bcrypt.hash(password, 12);
    user.otp = "";
    user.otpPurpose = "";
    user.otpExpires = null;
    user.otpVerified = false;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Password reset failed"
    });
  }
};