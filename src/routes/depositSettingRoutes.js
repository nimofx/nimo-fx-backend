const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  getDepositSettings,
  updateDepositSetting
} = require("../controllers/depositSettingController");

const router = express.Router();

// USER APP: get deposit addresses + QR
router.get("/deposit-settings", protect, getDepositSettings);

// ADMIN PANEL: get deposit addresses + QR
router.get("/admin/deposit-settings", protect, adminOnly, getDepositSettings);

// ADMIN PANEL: update address + QR for selected chain
router.put(
  "/admin/deposit-settings/:chain",
  protect,
  adminOnly,
  upload.single("qrImage"),
  updateDepositSetting
);

module.exports = router;