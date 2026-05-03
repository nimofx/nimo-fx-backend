const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  createSupportTicket,
  getMySupportTickets,
  getAllSupportTickets,
  replyToSupportTicket,
  closeSupportTicket
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

// ADMIN SUPPORT
router.get("/admin/support", protect, adminOnly, getAllSupportTickets);
router.patch("/admin/support/:id/reply", protect, adminOnly, replyToSupportTicket);
router.patch("/admin/support/:id/close", protect, adminOnly, closeSupportTicket);

module.exports = router;