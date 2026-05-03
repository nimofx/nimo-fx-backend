const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: ["deposit", "withdraw", "profit", "referral"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    chain: {
      type: String,
      trim: true
    },
    txId: {
      type: String,
      trim: true
    },
    walletAddress: {
      type: String,
      trim: true
    },
    screenshot: {
      type: String,
      default: ""
    },
    note: {
      type: String,
      default: ""
    },
    approvedAt: {
      type: Date,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);