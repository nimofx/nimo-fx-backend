const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const { submitKyc } = require("../controllers/userController");

// 📌 USER KYC SUBMIT
router.post(
  "/kyc",
  protect,
  upload.fields([
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack", maxCount: 1 }
  ]),
  submitKyc
);

module.exports = router;