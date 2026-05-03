const Transaction = require("../models/Transaction");
const User = require("../models/User");

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

    if (amt > req.user.walletBalance) {
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