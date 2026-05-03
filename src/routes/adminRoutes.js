const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  getPendingTransactions,
  getAllTransactions, // 🔥 ADD
  approveTransaction,
  rejectTransaction
} = require("../controllers/adminController");

const router = express.Router();

// 🔥 ALL TRANSACTIONS (FILTER SUPPORT)
router.get("/transactions", protect, adminOnly, getAllTransactions);

// 🔥 PENDING
router.get("/transactions/pending", protect, adminOnly, getPendingTransactions);

// 🔥 ACTIONS
router.patch("/transactions/:id/approve", protect, adminOnly, approveTransaction);
router.patch("/transactions/:id/reject", protect, adminOnly, rejectTransaction);

module.exports = router;