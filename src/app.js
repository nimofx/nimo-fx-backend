require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const kycRoutes = require("./routes/kycRoutes");
const supportRoutes = require("./routes/supportRoutes"); // 🔥 ADD
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
);

// 🔥 serve uploaded images
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.json({ success: true, message: "NIMO FX API is running" });
});

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api", transactionRoutes);
app.use("/api", kycRoutes);
app.use("/api", supportRoutes); // 🔥 ADD

// ADMIN
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

module.exports = app;