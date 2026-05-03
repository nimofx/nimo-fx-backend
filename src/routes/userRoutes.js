const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  getMe,
  submitKyc,
  getWallet,
  getReferral,
  applyReferralCode
} = require("../controllers/userController");

const router = express.Router();

router.get("/me", protect, getMe);

// KYC
router.post("/kyc", protect, submitKyc);

// WALLET
router.get("/wallet", protect, getWallet);

// REFERRAL
router.get("/referral", protect, getReferral);
router.post("/referral/apply", protect, applyReferralCode);

module.exports = router;