const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  getTrade,
  startTrade,
  getTradeProfits,
  getAdminTradeProfits,
  createTradeProfit
} = require("../controllers/tradeController");

const router = express.Router();

// USER TRADE
router.get("/trade", protect, getTrade);
router.post("/trade/start", protect, startTrade);
router.get("/trade/profits", protect, getTradeProfits);

// ADMIN TRADE PROFIT
router.get("/admin/trade-profits", protect, adminOnly, getAdminTradeProfits);
router.post("/admin/trade-profits", protect, adminOnly, createTradeProfit);

module.exports = router;