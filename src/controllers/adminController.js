const Transaction = require("../models/Transaction");
const User = require("../models/User");

// 🔥 GET ALL TRANSACTIONS (NEW)
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

    // ✅ DEPOSIT APPROVE
    if (tx.type === "deposit") {
      user.lockBalance += tx.amount;

      const lockDays = 60;
      const lockUntil = new Date();
      lockUntil.setDate(lockUntil.getDate() + lockDays);

      user.lockUntil = lockUntil;
    }

    // ✅ WITHDRAW APPROVE
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