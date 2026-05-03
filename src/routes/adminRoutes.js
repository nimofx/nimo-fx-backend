const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  getPendingTransactions,
  approveTransaction,
  rejectTransaction
} = require("../controllers/adminController");

const router = express.Router();

router.get("/transactions/pending", protect, adminOnly, getPendingTransactions);
router.patch("/transactions/:id/approve", protect, adminOnly, approveTransaction);
router.patch("/transactions/:id/reject", protect, adminOnly, rejectTransaction);

module.exports = router;