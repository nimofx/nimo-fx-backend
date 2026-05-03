const Transaction = require("../models/Transaction");
const User = require("../models/User");

// 🔥 GET ALL USERS
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
};

// 🔥 BLOCK USER
exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;

    await User.findByIdAndUpdate(id, { isActive: false });

    res.json({
      success: true,
      message: "User blocked"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to block user"
    });
  }
};

// 🔥 UNBLOCK USER
exports.unblockUser = async (req, res) => {
  try {
    const { id } = req.params;

    await User.findByIdAndUpdate(id, { isActive: true });

    res.json({
      success: true,
      message: "User unblocked"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to unblock user"
    });
  }
};

// 🔥 UPDATE USER BALANCE
exports.updateUserBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, action } = req.body;

    const amt = Number(amount);

    if (!amt || amt <= 0 || !["add", "subtract"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid balance update request"
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (action === "add") {
      user.walletBalance += amt;
    }

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

    res.json({
      success: true,
      message: "Balance updated"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update balance"
    });
  }
};

// 🔥 GET ALL TRANSACTIONS
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions"
    });
  }
};

// 🔥 GET ALL PENDING TRANSACTIONS
exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      status: "pending"
    })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions"
    });
  }
};

// 🔥 APPROVE TRANSACTION
exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    if (tx.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Transaction already processed"
      });
    }

    const user = await User.findById(tx.user);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (tx.type === "deposit") {
      user.lockBalance += tx.amount;

      const lockUntil = new Date();
      lockUntil.setDate(lockUntil.getDate() + 60);

      user.lockUntil = lockUntil;
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

    res.json({
      success: true,
      message: "Transaction approved"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Approval failed"
    });
  }
};

// 🔥 REJECT TRANSACTION
exports.rejectTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
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

    res.json({
      success: true,
      message: "Transaction rejected"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Rejection failed"
    });
  }
};