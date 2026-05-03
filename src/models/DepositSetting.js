const mongoose = require("mongoose");

const depositSettingSchema = new mongoose.Schema(
  {
    chain: {
      type: String,
      enum: ["TRC20", "BEP20 (BNB)", "ERC20", "Polygon", "Solana"],
      required: true,
      unique: true
    },
    address: {
      type: String,
      trim: true,
      default: ""
    },
    qrImage: {
      type: String,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("DepositSetting", depositSettingSchema);