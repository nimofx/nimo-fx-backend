const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  getAllUsers,
  blockUser,
  unblockUser,
  updateUserBalance,

  getAllKyc,
  approveKyc,
  rejectKyc,

  getAllSupport,
  replySupport,
  closeSupport,

  getPendingTransactions,
  getAllTransactions,
  approveTransaction,
  rejectTransaction
} = require("../controllers/adminController");

const router = express.Router();

// USERS
router.get("/users", protect, adminOnly, getAllUsers);
router.patch("/users/:id/block", protect, adminOnly, blockUser);
router.patch("/users/:id/unblock", protect, adminOnly, unblockUser);
router.patch("/users/:id/balance", protect, adminOnly, updateUserBalance);

// KYC
router.get("/kyc", protect, adminOnly, getAllKyc);
router.patch("/kyc/:id/approve", protect, adminOnly, approveKyc);
router.patch("/kyc/:id/reject", protect, adminOnly, rejectKyc);

// SUPPORT
router.get("/support", protect, adminOnly, getAllSupport);
router.patch("/support/:id/reply", protect, adminOnly, replySupport);
router.patch("/support/:id/close", protect, adminOnly, closeSupport);

// TRANSACTIONS
router.get("/transactions", protect, adminOnly, getAllTransactions);
router.get("/transactions/pending", protect, adminOnly, getPendingTransactions);
router.patch("/transactions/:id/approve", protect, adminOnly, approveTransaction);
router.patch("/transactions/:id/reject", protect, adminOnly, rejectTransaction);

module.exports = router;