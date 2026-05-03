const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Support = require("../models/Support");

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

    if (tx.type === "deposit") {
      user.lockBalance += tx.amount;
      const d = new Date();
      d.setDate(d.getDate() + 60);
      user.lockUntil = d;
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