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
      fullName: String,
      dob: String,
      address: String,
      panNumber: String,
      aadhaarNumber: String
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

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);