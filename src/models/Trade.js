const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 100
    },

    amountFromWallet: {
      type: Number,
      default: 0
    },

    amountFromLock: {
      type: Number,
      default: 0
    },

    lockedParts: [
      {
        amount: {
          type: Number,
          default: 0
        },
        lockedAt: {
          type: Date,
          default: null
        },
        unlockAt: {
          type: Date,
          default: null
        },
        source: {
          type: String,
          default: "deposit"
        },
        transaction: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Transaction",
          default: null
        }
      }
    ],

    status: {
      type: String,
      enum: ["active", "settled", "cancelled"],
      default: "active"
    },

    profitPercent: {
      type: Number,
      default: 0
    },

    grossProfit: {
      type: Number,
      default: 0
    },

    commissionPercent: {
      type: Number,
      default: 10
    },

    commissionAmount: {
      type: Number,
      default: 0
    },

    netProfit: {
      type: Number,
      default: 0
    },

    returnAmount: {
      type: Number,
      default: 0
    },

    profitRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TradeProfit",
      default: null
    },

    startedAt: {
      type: Date,
      default: Date.now
    },

    settledAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trade", tradeSchema);