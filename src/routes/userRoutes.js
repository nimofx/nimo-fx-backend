const express = require("express");
const { protect } = require("../middleware/authmiddleware");
const { getMe, submitKyc } = require("../controllers/userController");

const router = express.Router();

router.get("/me", protect, getMe);
router.post("/kyc", protect, submitKyc);

module.exports = router;