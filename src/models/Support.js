const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    subject: {
      type: String,
      trim: true,
      required: true
    },
    message: {
      type: String,
      trim: true,
      required: true
    },
    screenshot: {
      type: String,
      default: ""
    },
    adminReply: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["open", "replied", "closed"],
      default: "open"
    },
    repliedAt: {
      type: Date,
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Support", supportSchema);