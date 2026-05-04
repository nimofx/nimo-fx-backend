const Transaction = require("../models/Transaction");
const User = require("../models/User");

const roundAmount = (value) => Number(Number(value || 0).toFixed(8));

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

// 🔥 CREATE DEPOSIT
exports.createDeposit = async (req, res) => {
  try {
    const { amount, txId, chain } = req.body;

    if (!amount || !txId || !chain) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      type: "deposit",
      amount: Number(amount),
      txId,
      chain,
      screenshot: req.file?.path || "",
      status: "pending"
    });

    res.json({
      success: true,
      message: "Deposit submitted for approval",
      data: transaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Deposit failed"
    });
  }
};

// 🔥 CREATE WITHDRAW
exports.createWithdraw = async (req, res) => {
  try {
    const { amount, walletAddress, chain } = req.body;

    if (!amount || !walletAddress || !chain) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const amt = Number(amount);

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await autoUnlockExpiredLockEntries(user);

    if (amt > Number(user.walletBalance || 0)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      type: "withdraw",
      amount: amt,
      walletAddress,
      chain,
      status: "pending"
    });

    res.json({
      success: true,
      message: "Withdraw request submitted",
      data: transaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Withdraw failed"
    });
  }
};

// 🔥 GET TRANSACTIONS
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user: req.user._id
    }).sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions"
    });
  }
};