const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Support = require("../models/Support");

const DEPOSIT_REFERRAL_REQUIRED_COUNT = 5;
const DEPOSIT_REFERRAL_REWARD_AMOUNT = 100;
const DEPOSIT_REFERRAL_REWARD_NOTE = "5 Refer Complete";
const OLD_DEPOSIT_REFERRAL_REWARD_NOTE = "5 active deposit referrals reward";

const TWENTY_REFERRAL_REQUIRED_COUNT = 20;
const TWENTY_REFERRAL_REWARD_AMOUNT = 500;
const TWENTY_REFERRAL_REWARD_NOTE = "20 Refer Complete";
const OLD_TWENTY_REFERRAL_REWARD_NOTES = [
  "20 active trade referrals reward",
  "20 active deposit referrals reward"
];

const DIRECT_REFERRAL_NOTE = "Direct Referral";
const INDIRECT_REFERRAL_NOTE = "Indirect Referral";

const roundAmount = (value) => Number(Number(value || 0).toFixed(8));

const calculateDaysRemaining = (unlockAt) => {
  if (!unlockAt) return 0;

  const now = new Date();
  const unlockDate = new Date(unlockAt);

  if (unlockDate <= now) return 0;

  return Math.ceil(
    (unlockDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
};

const syncLockBalanceFromEntries = (user) => {
  const entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  const activeEntries = entries.filter((entry) => Number(entry.amount || 0) > 0);

  user.lockEntries = activeEntries;
  user.lockBalance = roundAmount(
    activeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );

  if (activeEntries.length > 0) {
    user.lockUntil = activeEntries.reduce((latest, entry) => {
      if (!entry.unlockAt) return latest;

      const unlockAt = new Date(entry.unlockAt);

      if (!latest || unlockAt > latest) {
        return unlockAt;
      }

      return latest;
    }, null);
  } else {
    user.lockUntil = null;
  }
};

const autoUnlockExpiredLockEntries = async (user) => {
  if (!user) return user;

  const now = new Date();
  const entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  if (entries.length === 0 && Number(user.lockBalance || 0) > 0 && user.lockUntil) {
    const lockUntil = new Date(user.lockUntil);

    if (lockUntil <= now) {
      user.walletBalance = roundAmount(
        Number(user.walletBalance || 0) + Number(user.lockBalance || 0)
      );
      user.lockBalance = 0;
      user.lockUntil = null;
      await user.save();
    }

    return user;
  }

  let unlockedAmount = 0;
  const activeEntries = [];

  entries.forEach((entry) => {
    const amount = Number(entry.amount || 0);

    if (amount <= 0) return;

    if (entry.unlockAt && new Date(entry.unlockAt) <= now) {
      unlockedAmount += amount;
    } else {
      activeEntries.push(entry);
    }
  });

  if (unlockedAmount > 0 || activeEntries.length !== entries.length) {
    user.walletBalance = roundAmount(Number(user.walletBalance || 0) + unlockedAmount);
    user.lockEntries = activeEntries;
    syncLockBalanceFromEntries(user);
    await user.save();
  }

  return user;
};

const getTotalApprovedDeposit = async (userId) => {
  const result = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: "deposit",
        status: "approved"
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" }
      }
    }
  ]);

  return Number(result?.[0]?.total || 0);
};

const getTierByDeposit = (deposit) => {
  if (deposit >= 10000) return 5;
  if (deposit >= 3500) return 4;
  if (deposit >= 1250) return 3;
  if (deposit >= 500) return 2;
  return 1;
};

const getCommissionByTier = (tier) => {
  if (tier === 5) return { directCommission: 20, indirectCommission: 10 };
  if (tier === 4) return { directCommission: 16, indirectCommission: 8 };
  if (tier === 3) return { directCommission: 12, indirectCommission: 6 };
  if (tier === 2) return { directCommission: 10, indirectCommission: 4 };

  return { directCommission: 8, indirectCommission: 2 };
};

const getActiveDepositReferralCount = async (userId) => {
  const directUsers = await User.find({
    referredBy: userId
  }).select("_id");

  const directUserIds = directUsers.map((user) => user._id);

  if (directUserIds.length === 0) return 0;

  const result = await Transaction.aggregate([
    {
      $match: {
        user: { $in: directUserIds },
        type: "deposit",
        status: "approved"
      }
    },
    {
      $group: {
        _id: "$user",
        totalDeposit: { $sum: "$amount" }
      }
    },
    {
      $match: {
        totalDeposit: { $gte: 100 }
      }
    },
    {
      $count: "activeCount"
    }
  ]);

  return Number(result?.[0]?.activeCount || 0);
};

const creditReferralBonusTransaction = async ({ user, amount, note }) => {
  const bonusAmount = roundAmount(amount);

  if (!user || !user.isActive || bonusAmount <= 0) return;

  const existingTransaction = await Transaction.findOne({
    user: user._id,
    type: "referral",
    status: "approved",
    note
  });

  if (existingTransaction) return;

  user.walletBalance = roundAmount(Number(user.walletBalance || 0) + bonusAmount);
  user.referralBonus = roundAmount(Number(user.referralBonus || 0) + bonusAmount);

  await user.save();

  await Transaction.create({
    user: user._id,
    type: "referral",
    amount: bonusAmount,
    status: "approved",
    note,
    approvedAt: new Date()
  });
};

const creditMilestoneReferralRewardIfEligible = async ({
  user,
  requiredCount,
  rewardAmount,
  rewardNote,
  oldRewardNotes = [],
  usePremiumFlag = false
}) => {
  if (!user || !user.isActive) return;

  const existingReward = await Transaction.findOne({
    user: user._id,
    type: "referral",
    status: "approved",
    note: {
      $in: [rewardNote, ...oldRewardNotes]
    }
  });

  if (existingReward) return;

  if (usePremiumFlag && user.premiumRewardCredited) {
    await Transaction.create({
      user: user._id,
      type: "referral",
      amount: rewardAmount,
      status: "approved",
      note: rewardNote,
      approvedAt: new Date()
    });

    return;
  }

  const activeDepositReferrals = await getActiveDepositReferralCount(user._id);

  if (activeDepositReferrals < requiredCount) return;

  if (usePremiumFlag) {
    user.premiumRewardUnlocked = true;
    user.premiumRewardCredited = true;
  }

  user.walletBalance = roundAmount(
    Number(user.walletBalance || 0) + Number(rewardAmount || 0)
  );

  user.referralBonus = roundAmount(
    Number(user.referralBonus || 0) + Number(rewardAmount || 0)
  );

  await user.save();

  await Transaction.create({
    user: user._id,
    type: "referral",
    amount: rewardAmount,
    status: "approved",
    note: rewardNote,
    approvedAt: new Date()
  });
};

const creditFiveReferralRewardIfEligible = async (user) => {
  await creditMilestoneReferralRewardIfEligible({
    user,
    requiredCount: DEPOSIT_REFERRAL_REQUIRED_COUNT,
    rewardAmount: DEPOSIT_REFERRAL_REWARD_AMOUNT,
    rewardNote: DEPOSIT_REFERRAL_REWARD_NOTE,
    oldRewardNotes: [OLD_DEPOSIT_REFERRAL_REWARD_NOTE],
    usePremiumFlag: true
  });
};

const creditTwentyReferralRewardIfEligible = async (user) => {
  await creditMilestoneReferralRewardIfEligible({
    user,
    requiredCount: TWENTY_REFERRAL_REQUIRED_COUNT,
    rewardAmount: TWENTY_REFERRAL_REWARD_AMOUNT,
    rewardNote: TWENTY_REFERRAL_REWARD_NOTE,
    oldRewardNotes: OLD_TWENTY_REFERRAL_REWARD_NOTES,
    usePremiumFlag: false
  });
};

const creditDepositReferralBonuses = async ({ depositor, depositTransaction }) => {
  if (!depositor || !depositor.referredBy || !depositTransaction) return;

  const depositAmount = Number(depositTransaction.amount || 0);

  if (depositAmount <= 0) return;

  const directReferrer = await User.findById(depositor.referredBy);

  if (!directReferrer || !directReferrer.isActive) return;

  const directReferrerDeposit = await getTotalApprovedDeposit(directReferrer._id);
  const directTier = getTierByDeposit(directReferrerDeposit);
  const { directCommission } = getCommissionByTier(directTier);

  const directBonus = roundAmount(
    (depositAmount * Number(directCommission || 0)) / 100
  );

  await creditReferralBonusTransaction({
    user: directReferrer,
    amount: directBonus,
    note: `${DIRECT_REFERRAL_NOTE} - Deposit ${depositTransaction._id}`
  });

  await creditFiveReferralRewardIfEligible(directReferrer);
  await creditTwentyReferralRewardIfEligible(directReferrer);

  if (!directReferrer.referredBy) return;

  const indirectReferrer = await User.findById(directReferrer.referredBy);

  if (!indirectReferrer || !indirectReferrer.isActive) return;

  if (String(indirectReferrer._id) === String(depositor._id)) return;

  const indirectReferrerDeposit = await getTotalApprovedDeposit(indirectReferrer._id);
  const indirectTier = getTierByDeposit(indirectReferrerDeposit);
  const { indirectCommission } = getCommissionByTier(indirectTier);

  const indirectBonus = roundAmount(
    (depositAmount * Number(indirectCommission || 0)) / 100
  );

  await creditReferralBonusTransaction({
    user: indirectReferrer,
    amount: indirectBonus,
    note: `${INDIRECT_REFERRAL_NOTE} - Deposit ${depositTransaction._id}`
  });
};

// ================= USERS =================

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(id, { isActive: false });
    res.json({ success: true, message: "User blocked" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to block user" });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(id, { isActive: true });
    res.json({ success: true, message: "User unblocked" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to unblock user" });
  }
};

exports.updateUserBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, action } = req.body;

    const amt = Number(amount);

    if (!amt || amt <= 0 || !["add", "subtract"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await autoUnlockExpiredLockEntries(user);

    if (action === "add") user.walletBalance += amt;

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

    res.json({ success: true, message: "Balance updated" });
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

// ================= REFERRALS =================

exports.getReferralSummary = async (req, res) => {
  try {
    const users = await User.find({})
      .select("name fullName email mobile phone referralCode referredBy isActive createdAt")
      .populate("referredBy", "name fullName email mobile phone referralCode")
      .sort({ createdAt: -1 })
      .lean();

    const directCounts = await User.aggregate([
      {
        $match: {
          referredBy: { $ne: null }
        }
      },
      {
        $group: {
          _id: "$referredBy",
          count: { $sum: 1 }
        }
      }
    ]);

    const activeCounts = await User.aggregate([
      {
        $match: {
          referredBy: { $ne: null }
        }
      },
      {
        $lookup: {
          from: "transactions",
          let: { referredUserId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$user", "$$referredUserId"] },
                    { $eq: ["$type", "deposit"] },
                    { $eq: ["$status", "approved"] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: "$user",
                totalDeposit: { $sum: "$amount" }
              }
            },
            {
              $match: {
                totalDeposit: { $gte: 100 }
              }
            }
          ],
          as: "approvedDepositStats"
        }
      },
      {
        $match: {
          "approvedDepositStats.0": { $exists: true }
        }
      },
      {
        $group: {
          _id: "$referredBy",
          count: { $sum: 1 }
        }
      }
    ]);

    const directCountMap = {};
    directCounts.forEach((item) => {
      if (item?._id) {
        directCountMap[item._id.toString()] = item.count;
      }
    });

    const activeCountMap = {};
    activeCounts.forEach((item) => {
      if (item?._id) {
        activeCountMap[item._id.toString()] = item.count;
      }
    });

    const referrals = users.map((user) => {
      const userId = user._id.toString();

      return {
        _id: user._id,
        name: user.name || user.fullName || "",
        fullName: user.fullName || user.name || "",
        email: user.email || "",
        mobile: user.mobile || user.phone || "",
        phone: user.phone || user.mobile || "",
        referralCode: user.referralCode || "",
        isActive: user.isActive,
        referredBy: user.referredBy
          ? {
              _id: user.referredBy._id,
              name: user.referredBy.name || user.referredBy.fullName || "",
              fullName: user.referredBy.fullName || user.referredBy.name || "",
              email: user.referredBy.email || "",
              mobile: user.referredBy.mobile || user.referredBy.phone || "",
              phone: user.referredBy.phone || user.referredBy.mobile || "",
              referralCode: user.referredBy.referralCode || ""
            }
          : null,
        directReferralCount: directCountMap[userId] || 0,
        activeReferralCount: activeCountMap[userId] || 0,
        createdAt: user.createdAt
      };
    });

    res.json({
      success: true,
      referrals
    });
  } catch (error) {
    console.error("Referral summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch referral summary"
    });
  }
};

exports.getUserDirectReferrals = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("name fullName email mobile phone referralCode")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const directUsers = await User.find({ referredBy: id })
      .select("name fullName email mobile phone referralCode isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const directUserIds = directUsers.map((item) => item._id);

    let depositMap = {};

    if (directUserIds.length > 0) {
      const depositStats = await Transaction.aggregate([
        {
          $match: {
            user: { $in: directUserIds },
            type: "deposit",
            status: "approved"
          }
        },
        {
          $group: {
            _id: "$user",
            totalApprovedDeposit: { $sum: "$amount" }
          }
        }
      ]);

      depositStats.forEach((item) => {
        if (item?._id) {
          depositMap[item._id.toString()] = Number(item.totalApprovedDeposit || 0);
        }
      });
    }

    const directReferrals = directUsers.map((item) => {
      const totalApprovedDeposit = Number(depositMap[item._id.toString()] || 0);
      const isActiveReferral = totalApprovedDeposit >= 100;

      return {
        _id: item._id,
        name: item.name || item.fullName || "",
        fullName: item.fullName || item.name || "",
        email: item.email || "",
        mobile: item.mobile || item.phone || "",
        phone: item.phone || item.mobile || "",
        referralCode: item.referralCode || "",
        isActive: item.isActive,
        joinedAt: item.createdAt,
        totalApprovedDeposit,
        depositApproved: totalApprovedDeposit > 0,
        active: isActiveReferral
      };
    });

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name || user.fullName || "",
        fullName: user.fullName || user.name || "",
        email: user.email || "",
        mobile: user.mobile || user.phone || "",
        phone: user.phone || user.mobile || "",
        referralCode: user.referralCode || ""
      },
      totalDirectReferrals: directReferrals.length,
      activeDirectReferrals: directReferrals.filter((item) => item.active).length,
      directReferrals
    });
  } catch (error) {
    console.error("Direct referrals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch direct referrals"
    });
  }
};

// ================= KYC =================

exports.getAllKyc = async (req, res) => {
  try {
    const users = await User.find({
      kycStatus: { $ne: "not_submitted" }
    })
      .select("name email kyc kycStatus")
      .sort({ updatedAt: -1 });

    res.json(users);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch KYC" });
  }
};

exports.approveKyc = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.kycStatus = "approved";
    await user.save();

    res.json({ success: true, message: "KYC approved" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to approve KYC" });
  }
};

exports.rejectKyc = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.kycStatus = "rejected";
    await user.save();

    res.json({ success: true, message: "KYC rejected" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to reject KYC" });
  }
};

// ================= SUPPORT =================

exports.getAllSupport = async (req, res) => {
  try {
    const tickets = await Support.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch support" });
  }
};

exports.replySupport = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Reply required"
      });
    }

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    ticket.adminReply = reply;
    ticket.status = "replied";
    ticket.repliedAt = new Date();

    await ticket.save();

    res.json({ success: true, message: "Reply sent" });
  } catch {
    res.status(500).json({ success: false, message: "Reply failed" });
  }
};

exports.closeSupport = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    ticket.status = "closed";
    ticket.closedAt = new Date();

    await ticket.save();

    res.json({ success: true, message: "Ticket closed" });
  } catch {
    res.status(500).json({ success: false, message: "Close failed" });
  }
};

// ================= TRANSACTIONS =================

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
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch {
    res.status(500).json({ success: false, message: "Failed" });
  }
};

exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (tx.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Transaction already processed"
      });
    }

    const user = await User.findById(tx.user);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await autoUnlockExpiredLockEntries(user);

    if (tx.type === "deposit") {
      const lockedAt = new Date();
      const unlockAt = new Date(lockedAt);
      unlockAt.setDate(unlockAt.getDate() + 60);

      user.lockEntries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

      user.lockEntries.push({
        amount: Number(tx.amount || 0),
        lockedAt,
        unlockAt,
        source: "deposit",
        transaction: tx._id
      });

      syncLockBalanceFromEntries(user);
    }

    if (tx.type === "withdraw") {
      if (tx.amount > user.walletBalance) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance"
        });
      }

      user.walletBalance = roundAmount(Number(user.walletBalance || 0) - Number(tx.amount || 0));
    }

    tx.status = "approved";
    tx.approvedAt = new Date();

    await user.save();
    await tx.save();

    if (tx.type === "deposit") {
      await creditDepositReferralBonuses({
        depositor: user,
        depositTransaction: tx
      });
    }

    res.json({ success: true, message: "Transaction approved" });
  } catch {
    res.status(500).json({ success: false, message: "Approval failed" });
  }
};

exports.rejectTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const tx = await Transaction.findById(id);

    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
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

    res.json({ success: true, message: "Transaction rejected" });
  } catch {
    res.status(500).json({ success: false, message: "Rejection failed" });
  }
};
