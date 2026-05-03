const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  getMe,
  submitKyc,
  getWallet
} = require("../controllers/userController");

const router = express.Router();

router.get("/me", protect, getMe);
router.post("/kyc", protect, submitKyc);

// 🔥 WALLET ROUTE
router.get("/wallet", protect, getWallet);

module.exports = router;