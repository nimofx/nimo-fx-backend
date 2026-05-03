const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  getReferral,
  applyReferralCode
} = require("../controllers/referralController");

const router = express.Router();

router.get("/", protect, getReferral);
router.post("/apply", protect, applyReferralCode);

module.exports = router;