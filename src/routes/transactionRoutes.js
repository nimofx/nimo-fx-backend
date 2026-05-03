const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  createDeposit,
  createWithdraw,
  getTransactions
} = require("../controllers/transactionController");

const router = express.Router();

router.post("/deposit", protect, createDeposit);
router.post("/withdraw", protect, createWithdraw);
router.get("/transaction", protect, getTransactions);

module.exports = router;