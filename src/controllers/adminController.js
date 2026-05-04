const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Support = require("../models/Support");

const roundAmount = (value) => Number(Number(value || 0).toFixed(8));

const calculateDaysRemaining = (unlockAt) => {
  if (!unlockAt) return 0;

  const now = new Date();
  const unlockDate = new Date(unlockAt);

  if (unlockDate <= now) return 0;

  return Math.ceil(
    (unlockDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
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

// ================= USERS =================

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(id, { isActive: false });
    res.json({ success: true, message: "User blocked" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(id, { isActive: true });
    res.json({ success: true, message: "User unblocked" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to unblock user" });
  }
};

exports.updateUserBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, action } = req.body;

    const amt = Number(amount);

    if (!amt || amt <= 0 || !["add", "subtract"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await autoUnlockExpiredLockEntries(user);

    if (action === "add") user.walletBalance += amt;

    if (action === "subtract") {
      if (amt > user.walletBalance) {
        return res.status(400).json({
          success: false,
          message: "Insufficient user balance"
        });
      }
      user.walletBalance -= amt;
    }

    await user.save();

    res.json({ success: true, message: "Balance updated" });
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

// ================= KYC =================

exports.getAllKyc = async (req, res) => {
  try {
    const users = await User.find({
      kycStatus: { $ne: "not_submitted" }
    })
      .select("name email kyc kycStatus")
      .sort({ updatedAt: -1 });

    res.json(users);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch KYC" });
  }
};

exports.approveKyc = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.kycStatus = "approved";
    await user.save();

    res.json({ success: true, message: "KYC approved" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to approve KYC" });
  }
};

exports.rejectKyc = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.kycStatus = "rejected";
    await user.save();

    res.json({ success: true, message: "KYC rejected" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to reject KYC" });
  }
};

// ================= SUPPORT =================

exports.getAllSupport = async (req, res) => {
  try {
    const tickets = await Support.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch support" });
  }
};

exports.replySupport = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Reply required"
      });
    }

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    ticket.adminReply = reply;
    ticket.status = "replied";
    ticket.repliedAt = new Date();

    await ticket.save();

    res.json({ success: true, message: "Reply sent" });
  } catch {
    res.status(500).json({ success: false, message: "Reply failed" });
  }
};

exports.closeSupport = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    ticket.status = "closed";
    ticket.closedAt = new Date();

    await ticket.save();

    res.json({ success: true, message: "Ticket closed" });
  } catch {
    res.status(500).json({ success: false, message: "Close failed" });
  }
};

// ================= TRANSACTIONS =================

exports.getAllTransactions = async (req, res) => {
  try {
    const { type, status } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const transactions = await Transaction.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (tx.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Transaction already processed"
      });
    }

    const user = await User.findById(tx.user);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await autoUnlockExpiredLockEntries(user);

    if (tx.type === "deposit") {
      const lockedAt = new Date();
      const unlockAt = new Date(lockedAt);
      unlockAt.setDate(unlockAt.getDate() + 60);

      user.lockEntries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

      user.lockEntries.push({
        amount: Number(tx.amount || 0),
        lockedAt,
        unlockAt,
        source: "deposit",
        transaction: tx._id
      });

      syncLockBalanceFromEntries(user);
    }

    if (tx.type === "withdraw") {
      if (tx.amount > user.walletBalance) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance"
        });
      }
      user.walletBalance -= tx.amount;
    }

    tx.status = "approved";
    tx.approvedAt = new Date();

    await user.save();
    await tx.save();

    res.json({ success: true, message: "Transaction approved" });
  } catch {
    res.status(500).json({ success: false, message: "Approval failed" });
  }
};

exports.rejectTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (tx.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Transaction already processed"
      });
    }

    tx.status = "rejected";
    tx.rejectedAt = new Date();

    await tx.save();

    res.json({ success: true, message: "Transaction rejected" });
  } catch {
    res.status(500).json({ success: false, message: "Rejection failed" });
  }
};