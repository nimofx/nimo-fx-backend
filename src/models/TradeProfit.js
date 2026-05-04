const mongoose = require("mongoose");

const tradeProfitSchema = new mongoose.Schema(
  {
    profitPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },

    dateKey: {
      type: String,
      required: true,
      unique: true
    },

    displayDate: {
      type: String,
      required: true
    },

    displayTime: {
      type: String,
      required: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TradeProfit", tradeProfitSchema);