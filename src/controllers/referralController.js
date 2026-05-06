const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Trade = require("../models/Trade");

const DEPOSIT_REFERRAL_REQUIRED_COUNT = 5;
const DEPOSIT_REFERRAL_REWARD_AMOUNT = 100;
const DEPOSIT_REFERRAL_REWARD_NOTE = "5 active deposit referrals reward";

const TRADE_REFERRAL_REQUIRED_COUNT = 20;
const TRADE_REFERRAL_REWARD_AMOUNT = 500;
const TRADE_REFERRAL_REWARD_NOTE = "20 active trade referrals reward";

const roundAmount = (value) => Number(Number(value || 0).toFixed(8));

const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
};

const ensureReferralCode = async (user) => {
  if (user.referralCode) return user.referralCode;

  let code = generateReferralCode();
  let exists = await User.findOne({ referralCode: code });

  while (exists) {
    code = generateReferralCode();
    exists = await User.findOne({ referralCode: code });
  }

  user.referralCode = code;
  await user.save();

  return code;
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

const getDepositReferralStats = async (directUserIds) => {
  if (!directUserIds || directUserIds.length === 0) {
    return {
      activeDepositReferrals: 0,
      depositMap: {}
    };
  }

  const depositTotals = await Transaction.aggregate([
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
    }
  ]);

  const depositMap = {};
  let activeDepositReferrals = 0;

  depositTotals.forEach((item) => {
    const totalDeposit = Number(item.totalDeposit || 0);
    depositMap[String(item._id)] = totalDeposit;

    if (totalDeposit >= 100) {
      activeDepositReferrals += 1;
    }
  });

  return {
    activeDepositReferrals,
    depositMap
  };
};

const getTradeReferralStats = async (directUserIds) => {
  if (!directUserIds || directUserIds.length === 0) {
    return {
      activeTradeReferrals: 0,
      tradeMap: {}
    };
  }

  const tradeStats = await Trade.aggregate([
    {
      $match: {
        user: { $in: directUserIds },
        status: "settled"
      }
    },
    {
      $group: {
        _id: "$user",
        completedTrades: { $sum: 1 },
        totalTradeAmount: { $sum: "$amount" },
        lastSettledAt: { $max: "$settledAt" }
      }
    }
  ]);

  const tradeMap = {};

  tradeStats.forEach((item) => {
    tradeMap[String(item._id)] = {
      completedTrades: Number(item.completedTrades || 0),
      totalTradeAmount: Number(item.totalTradeAmount || 0),
      lastSettledAt: item.lastSettledAt || null
    };
  });

  return {
    activeTradeReferrals: tradeStats.length,
    tradeMap
  };
};

const creditDepositReferralRewardIfEligible = async (user, activeDepositReferrals) => {
  if (user.premiumRewardCredited) {
    return {
      credited: true
    };
  }

  if (activeDepositReferrals < DEPOSIT_REFERRAL_REQUIRED_COUNT) {
    return {
      credited: false
    };
  }

  user.premiumRewardUnlocked = true;
  user.premiumRewardCredited = true;
  user.walletBalance = roundAmount(
    Number(user.walletBalance || 0) + DEPOSIT_REFERRAL_REWARD_AMOUNT
  );
  user.referralBonus = roundAmount(
    Number(user.referralBonus || 0) + DEPOSIT_REFERRAL_REWARD_AMOUNT
  );

  await user.save();

  const existingTransaction = await Transaction.findOne({
    user: user._id,
    type: "referral",
    status: "approved",
    note: DEPOSIT_REFERRAL_REWARD_NOTE
  });

  if (!existingTransaction) {
    await Transaction.create({
      user: user._id,
      type: "referral",
      amount: DEPOSIT_REFERRAL_REWARD_AMOUNT,
      status: "approved",
      note: DEPOSIT_REFERRAL_REWARD_NOTE,
      approvedAt: new Date()
    });
  }

  return {
    credited: true
  };
};

const creditTradeReferralRewardIfEligible = async (user, activeTradeReferrals) => {
  const existingTransaction = await Transaction.findOne({
    user: user._id,
    type: "referral",
    status: "approved",
    note: TRADE_REFERRAL_REWARD_NOTE
  });

  if (existingTransaction) {
    return {
      credited: true
    };
  }

  if (activeTradeReferrals < TRADE_REFERRAL_REQUIRED_COUNT) {
    return {
      credited: false
    };
  }

  user.walletBalance = roundAmount(
    Number(user.walletBalance || 0) + TRADE_REFERRAL_REWARD_AMOUNT
  );

  user.referralBonus = roundAmount(
    Number(user.referralBonus || 0) + TRADE_REFERRAL_REWARD_AMOUNT
  );

  await user.save();

  await Transaction.create({
    user: user._id,
    type: "referral",
    amount: TRADE_REFERRAL_REWARD_AMOUNT,
    status: "approved",
    note: TRADE_REFERRAL_REWARD_NOTE,
    approvedAt: new Date()
  });

  return {
    credited: true
  };
};

exports.getReferral = async (req, res) => {
  try {
    const referralCode = await ensureReferralCode(req.user);

    const totalApprovedDeposit = await getTotalApprovedDeposit(req.user._id);
    const tier = getTierByDeposit(totalApprovedDeposit);
    const { directCommission, indirectCommission } = getCommissionByTier(tier);

    const directUsersList = await User.find({
      referredBy: req.user._id
    })
      .select("_id name email phone createdAt")
      .sort({ createdAt: -1 });

    const directUserIds = directUsersList.map((user) => user._id);

    const directUsers = directUserIds.length;

    const subUsers = directUserIds.length
      ? await User.countDocuments({
          referredBy: { $in: directUserIds }
        })
      : 0;

    const { activeDepositReferrals, depositMap } =
      await getDepositReferralStats(directUserIds);

    const { activeTradeReferrals, tradeMap } =
      await getTradeReferralStats(directUserIds);

    const depositRewardResult = await creditDepositReferralRewardIfEligible(
      req.user,
      activeDepositReferrals
    );

    const tradeRewardResult = await creditTradeReferralRewardIfEligible(
      req.user,
      activeTradeReferrals
    );

    const referralHistory = directUsersList.map((user) => {
      const userId = String(user._id);
      const totalDeposit = Number(depositMap[userId] || 0);
      const tradeInfo = tradeMap[userId] || {};
      const completedTrades = Number(tradeInfo.completedTrades || 0);

      return {
        id: user._id,
        name: user.name || "User",
        email: user.email || "",
        phone: user.phone || "",
        joinedAt: user.createdAt,

        totalDeposit,
        depositStatus: totalDeposit >= 100 ? "active" : "inactive",

        completedTrades,
        totalTradeAmount: Number(tradeInfo.totalTradeAmount || 0),
        lastSettledAt: tradeInfo.lastSettledAt || null,
        tradeStatus: completedTrades > 0 ? "completed" : "pending",

        status: totalDeposit >= 100 || completedTrades > 0 ? "active" : "inactive"
      };
    });

    const requiredReferrals = DEPOSIT_REFERRAL_REQUIRED_COUNT;
    const activeReferrals = activeDepositReferrals;
    const remainingReferrals = Math.max(requiredReferrals - activeReferrals, 0);

    const tradeRequiredReferrals = TRADE_REFERRAL_REQUIRED_COUNT;
    const completedTradeReferrals = activeTradeReferrals;
    const tradeRemainingReferrals = Math.max(
      tradeRequiredReferrals - completedTradeReferrals,
      0
    );

    res.json({
      success: true,
      referralCode,
      referredBy: req.user.referredByCode || "",
      isReferralLocked: Boolean(req.user.isReferralLocked),

      directUsers,
      subUsers,

      activeReferrals,
      requiredReferrals,
      remainingReferrals,

      activeDepositReferrals,
      completedTradeReferrals,
      activeTradeReferrals,
      tradeRequiredReferrals,
      tradeRemainingReferrals,

      referralHistory,

      referralBonus: Number(req.user.referralBonus || 0),
      totalApprovedDeposit,
      tier,

      directCommission,
      indirectCommission,

      premiumRewardUnlocked: Boolean(depositRewardResult.credited),

      depositReferralReward: {
        requiredReferrals,
        activeReferrals,
        remainingReferrals,
        rewardAmount: DEPOSIT_REFERRAL_REWARD_AMOUNT,
        credited: Boolean(depositRewardResult.credited)
      },

      tradeReferralReward: {
        requiredReferrals: tradeRequiredReferrals,
        completedReferrals: completedTradeReferrals,
        remainingReferrals: tradeRemainingReferrals,
        rewardAmount: TRADE_REFERRAL_REWARD_AMOUNT,
        credited: Boolean(tradeRewardResult.credited)
      }
    });
  } catch (error) {
    console.error("Get referral error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch referral data"
    });
  }
};

exports.applyReferralCode = async (req, res) => {
  try {
    const referralCode = String(req.body.referralCode || "")
      .trim()
      .toUpperCase();

    if (!referralCode || referralCode.length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Invalid referral code"
      });
    }

    if (req.user.isReferralLocked || req.user.referredBy) {
      return res.status(400).json({
        success: false,
        message: "Referral code already applied"
      });
    }

    const myCode = await ensureReferralCode(req.user);

    if (referralCode === myCode) {
      return res.status(400).json({
        success: false,
        message: "You cannot use your own referral code"
      });
    }

    const referrer = await User.findOne({ referralCode });

    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: "Referral code not found"
      });
    }

    req.user.referredBy = referrer._id;
    req.user.referredByCode = referralCode;
    req.user.isReferralLocked = true;

    await req.user.save();

    res.json({
      success: true,
      message: "Referral code applied successfully"
    });
  } catch (error) {
    console.error("Apply referral error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to apply referral code"
    });
  }
};