const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  getMe,
  submitKyc,
  getWallet
} = require("../controllers/userController");

const referralRoutes = require("./referralRoutes");

const router = express.Router();

router.get("/me", protect, getMe);

// KYC
router.post("/kyc", protect, submitKyc);

// WALLET
router.get("/wallet", protect, getWallet);

// REFERRAL
router.use("/referral", referralRoutes);

module.exports = router;