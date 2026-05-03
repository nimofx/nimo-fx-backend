const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  createSupportTicket,
  getMySupportTickets
} = require("../controllers/supportController");

const router = express.Router();

// USER SUPPORT
router.post(
  "/support",
  protect,
  upload.single("screenshot"),
  createSupportTicket
);

router.get("/support/my", protect, getMySupportTickets);

module.exports = router;