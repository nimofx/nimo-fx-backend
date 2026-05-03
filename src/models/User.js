const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true
    },
    phone: {
      type: String,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    roles: {
      type: [String],
      enum: ["user", "admin"],
      default: ["user"]
    },

    kycStatus: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted"
    },
    kyc: {
      dob: String,
      address1: String,
      address2: String,
      district: String,
      state: String,
      pin: String,
      aadhaar: String,
      aadhaarFront: String,
      aadhaarBack: String
    },

    walletBalance: {
      type: Number,
      default: 0
    },
    lockBalance: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },

    referralCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    referredByCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: ""
    },
    isReferralLocked: {
      type: Boolean,
      default: false
    },
    referralBonus: {
      type: Number,
      default: 0
    },
    premiumRewardUnlocked: {
      type: Boolean,
      default: false
    },
    premiumRewardCredited: {
      type: Boolean,
      default: false
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);