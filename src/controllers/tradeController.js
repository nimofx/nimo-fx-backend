const Trade = require("../models/Trade");
const TradeProfit = require("../models/TradeProfit");
const User = require("../models/User");

const COMMISSION_PERCENT = 10;

const roundAmount = (value) => Number(Number(value || 0).toFixed(8));

const getISTParts = () => {
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = dateParts.find((p) => p.type === "year")?.value;
  const month = dateParts.find((p) => p.type === "month")?.value;
  const day = dateParts.find((p) => p.type === "day")?.value;

  const dateKey = `${year}-${month}-${day}`;

  const displayDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(now);

  const displayTime =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(now) + " IST";

  return {
    dateKey,
    displayDate,
    displayTime
  };
};

const isTradingTimeIST = () => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = 9 * 60;
  const endMinutes = 15 * 60 + 59;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

const keepLatestSevenProfitRecords = async () => {
  const records = await TradeProfit.find().sort({ dateKey: -1 }).select("_id");

  const oldRecords = records.slice(7);

  if (oldRecords.length > 0) {
    await TradeProfit.deleteMany({
      _id: { $in: oldRecords.map((item) => item._id) }
    });
  }
};

const settleActiveTrades = async (profitRecord) => {
  const activeTrades = await Trade.find({ status: "active" }).sort({
    createdAt: 1
  });

  let settledCount = 0;

  for (const trade of activeTrades) {
    const user = await User.findById(trade.user);

    if (!user) continue;

    const grossProfit = roundAmount(
      (Number(trade.amount || 0) * Number(profitRecord.profitPercent || 0)) / 100
    );

    const commissionAmount = roundAmount(
      (grossProfit * COMMISSION_PERCENT) / 100
    );

    const netProfit = roundAmount(grossProfit - commissionAmount);
    const returnAmount = roundAmount(Number(trade.amount || 0) + netProfit);

    user.walletBalance = roundAmount(Number(user.walletBalance || 0) + returnAmount);

    trade.status = "settled";
    trade.profitPercent = Number(profitRecord.profitPercent || 0);
    trade.grossProfit = grossProfit;
    trade.commissionPercent = COMMISSION_PERCENT;
    trade.commissionAmount = commissionAmount;
    trade.netProfit = netProfit;
    trade.returnAmount = returnAmount;
    trade.profitRecord = profitRecord._id;
    trade.settledAt = new Date();

    await user.save();
    await trade.save();

    settledCount += 1;
  }

  return settledCount;
};

// USER: trade overview
exports.getTrade = async (req, res) => {
  try {
    const activeTrades = await Trade.find({
      user: req.user._id,
      status: "active"
    }).sort({ createdAt: -1 });

    const recentTrades = await Trade.find({
      user: req.user._id
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const profitHistory = await TradeProfit.find()
      .sort({ dateKey: -1 })
      .limit(7);

    const tradingUSDT = activeTrades.reduce(
      (sum, trade) => sum + Number(trade.amount || 0),
      0
    );

    res.json({
      success: true,
      tradingUSDT: roundAmount(tradingUSDT),
      activeTrades,
      recentTrades,
      profitHistory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch trade data"
    });
  }
};

// USER: start trade
exports.startTrade = async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum trade amount is 100 USDT"
      });
    }

    if (!isTradingTimeIST()) {
      return res.status(400).json({
        success: false,
        message: "Trading is allowed only between 9:00 AM and 3:59 PM IST"
      });
    }

    const user = await User.findById(req.user._id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive"
      });
    }

    const walletBalance = Number(user.walletBalance || 0);
    const lockBalance = Number(user.lockBalance || 0);
    const totalWalletBalance = roundAmount(walletBalance + lockBalance);

    if (amount > totalWalletBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient total wallet balance"
      });
    }

    let remaining = amount;

    const amountFromWallet = Math.min(walletBalance, remaining);
    user.walletBalance = roundAmount(walletBalance - amountFromWallet);
    remaining = roundAmount(remaining - amountFromWallet);

    const amountFromLock = Math.min(lockBalance, remaining);
    user.lockBalance = roundAmount(lockBalance - amountFromLock);
    remaining = roundAmount(remaining - amountFromLock);

    if (remaining > 0) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    const trade = await Trade.create({
      user: user._id,
      amount,
      amountFromWallet,
      amountFromLock,
      status: "active",
      startedAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: "Trade started successfully",
      trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Trade failed"
    });
  }
};

// USER: last 7 profit history
exports.getTradeProfits = async (req, res) => {
  try {
    const profits = await TradeProfit.find()
      .sort({ dateKey: -1 })
      .limit(7);

    res.json(profits);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch profit history"
    });
  }
};

// ADMIN: get profit history
exports.getAdminTradeProfits = async (req, res) => {
  try {
    const profits = await TradeProfit.find()
      .sort({ dateKey: -1 })
      .limit(7)
      .populate("createdBy", "name email");

    res.json(profits);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin profit history"
    });
  }
};

// ADMIN: add today's profit and settle active trades
exports.createTradeProfit = async (req, res) => {
  try {
    const profitPercent = Number(req.body.profitPercent);

    if (isNaN(profitPercent) || profitPercent < 0 || profitPercent > 100) {
      return res.status(400).json({
        success: false,
        message: "Enter valid profit percentage"
      });
    }

    const ist = getISTParts();

    const profitRecord = await TradeProfit.findOneAndUpdate(
      { dateKey: ist.dateKey },
      {
        profitPercent,
        dateKey: ist.dateKey,
        displayDate: ist.displayDate,
        displayTime: ist.displayTime,
        createdBy: req.user._id
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    const settledCount = await settleActiveTrades(profitRecord);

    await keepLatestSevenProfitRecords();

    res.json({
      success: true,
      message: "Profit saved and active trades settled",
      profit: profitRecord,
      settledCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to save trade profit"
    });
  }
};