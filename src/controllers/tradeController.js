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

const syncLockBalanceFromEntries = (user) => {
  const entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  const activeEntries = entries.filter((entry) => Number(entry.amount || 0) > 0);

  user.lockEntries = activeEntries;
  user.lockBalance = roundAmount(
    activeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );

  if (activeEntries.length > 0) {
    user.lockUntil = activeEntries.reduce((latest, entry) => {
      if (!entry.unlockAt) return latest;

      const unlockAt = new Date(entry.unlockAt);

      if (!latest || unlockAt > latest) {
        return unlockAt;
      }

      return latest;
    }, null);
  } else {
    user.lockUntil = null;
  }
};

const autoUnlockExpiredLockEntries = async (user) => {
  if (!user) return user;

  const now = new Date();
  const entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  if (entries.length === 0 && Number(user.lockBalance || 0) > 0 && user.lockUntil) {
    const lockUntil = new Date(user.lockUntil);

    if (lockUntil <= now) {
      user.walletBalance = roundAmount(
        Number(user.walletBalance || 0) + Number(user.lockBalance || 0)
      );
      user.lockBalance = 0;
      user.lockUntil = null;
      await user.save();
    }

    return user;
  }

  let unlockedAmount = 0;
  const activeEntries = [];

  entries.forEach((entry) => {
    const amount = Number(entry.amount || 0);

    if (amount <= 0) return;

    if (entry.unlockAt && new Date(entry.unlockAt) <= now) {
      unlockedAmount += amount;
    } else {
      activeEntries.push(entry);
    }
  });

  if (unlockedAmount > 0 || activeEntries.length !== entries.length) {
    user.walletBalance = roundAmount(Number(user.walletBalance || 0) + unlockedAmount);
    user.lockEntries = activeEntries;
    syncLockBalanceFromEntries(user);
    await user.save();
  }

  return user;
};

const deductFromLockEntries = (user, amountNeeded) => {
  let remaining = roundAmount(amountNeeded);
  const lockedParts = [];

  let entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  entries = entries
    .map((entry) => ({
      amount: Number(entry.amount || 0),
      lockedAt: entry.lockedAt || null,
      unlockAt: entry.unlockAt || user.lockUntil || null,
      source: entry.source || "deposit",
      transaction: entry.transaction || null
    }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => new Date(a.unlockAt || 0) - new Date(b.unlockAt || 0));

  if (entries.length === 0 && Number(user.lockBalance || 0) > 0) {
    const fallbackUnlockAt = user.lockUntil || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    entries = [
      {
        amount: Number(user.lockBalance || 0),
        lockedAt: user.createdAt || new Date(),
        unlockAt: fallbackUnlockAt,
        source: "legacy",
        transaction: null
      }
    ];
  }

  const updatedEntries = [];

  for (const entry of entries) {
    if (remaining <= 0) {
      updatedEntries.push(entry);
      continue;
    }

    const deductAmount = Math.min(Number(entry.amount || 0), remaining);

    if (deductAmount > 0) {
      lockedParts.push({
        amount: roundAmount(deductAmount),
        lockedAt: entry.lockedAt || null,
        unlockAt: entry.unlockAt || null,
        source: entry.source || "deposit",
        transaction: entry.transaction || null
      });

      remaining = roundAmount(remaining - deductAmount);
    }

    const leftAmount = roundAmount(Number(entry.amount || 0) - deductAmount);

    if (leftAmount > 0) {
      updatedEntries.push({
        ...entry,
        amount: leftAmount
      });
    }
  }

  user.lockEntries = updatedEntries;
  syncLockBalanceFromEntries(user);

  return {
    amountFromLock: roundAmount(
      lockedParts.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    ),
    lockedParts,
    remaining
  };
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

    await autoUnlockExpiredLockEntries(user);

    const grossProfit = roundAmount(
      (Number(trade.amount || 0) * Number(profitRecord.profitPercent || 0)) / 100
    );

    const commissionAmount = roundAmount(
      (grossProfit * COMMISSION_PERCENT) / 100
    );

    const netProfit = roundAmount(grossProfit - commissionAmount);
    const returnAmount = roundAmount(Number(trade.amount || 0) + netProfit);

    user.walletBalance = roundAmount(
      Number(user.walletBalance || 0) +
        Number(trade.amountFromWallet || 0) +
        netProfit
    );

    const now = new Date();

    let lockedParts = Array.isArray(trade.lockedParts) ? trade.lockedParts : [];

    if (lockedParts.length === 0 && Number(trade.amountFromLock || 0) > 0) {
      const fallbackUnlockAt = new Date(trade.startedAt || new Date());
      fallbackUnlockAt.setDate(fallbackUnlockAt.getDate() + 60);

      lockedParts = [
        {
          amount: Number(trade.amountFromLock || 0),
          lockedAt: trade.startedAt || new Date(),
          unlockAt: fallbackUnlockAt,
          source: "legacy",
          transaction: null
        }
      ];
    }

    user.lockEntries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

    lockedParts.forEach((part) => {
      const amount = Number(part.amount || 0);

      if (amount <= 0) return;

      if (part.unlockAt && new Date(part.unlockAt) <= now) {
        user.walletBalance = roundAmount(Number(user.walletBalance || 0) + amount);
      } else {
        user.lockEntries.push({
          amount,
          lockedAt: part.lockedAt || trade.startedAt || new Date(),
          unlockAt: part.unlockAt || null,
          source: part.source || "deposit",
          transaction: part.transaction || null
        });
      }
    });

    syncLockBalanceFromEntries(user);

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
    const user = await User.findById(req.user._id);

    if (user) {
      await autoUnlockExpiredLockEntries(user);
    }

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

    await autoUnlockExpiredLockEntries(user);

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

    const lockDeduction = remaining > 0
      ? deductFromLockEntries(user, remaining)
      : {
          amountFromLock: 0,
          lockedParts: [],
          remaining: 0
        };

    if (lockDeduction.remaining > 0) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    const trade = await Trade.create({
      user: user._id,
      amount,
      amountFromWallet,
      amountFromLock: lockDeduction.amountFromLock,
      lockedParts: lockDeduction.lockedParts,
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