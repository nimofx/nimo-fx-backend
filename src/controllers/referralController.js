const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Trade = require("../models/Trade");

const DEPOSIT_REFERRAL_REQUIRED_COUNT = 5;
const DEPOSIT_REFERRAL_REWARD_AMOUNT = 100;
const DEPOSIT_REFERRAL_REWARD_NOTE = "5 Refer Complete";
const OLD_DEPOSIT_REFERRAL_REWARD_NOTE = "5 active deposit referrals reward";

const TRADE_REFERRAL_REQUIRED_COUNT = 20;
const TRADE_REFERRAL_REWARD_AMOUNT = 500;
const TRADE_REFERRAL_REWARD_NOTE = "20 Refer Complete";
const OLD_TRADE_REFERRAL_REWARD_NOTE = "20 active trade referrals reward";

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

const getDirectUserIds = async (userId) => {
  const directUsersList = await User.find({
    referredBy: userId
  }).select("_id");

  return directUsersList.map((user) => user._id);
};

const getDepositReferralStats = async (directUserIds) => {
  if (!directUserIds || directUserIds.length === 0) {
    return {
      activeDepositReferrals: 0
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

  return {
    activeDepositReferrals: Number(depositTotals?.[0]?.activeCount || 0)
  };
};

const getTradeReferralStats = async (directUserIds) => {
  if (!directUserIds || directUserIds.length === 0) {
    return {
      activeTradeReferrals: 0
    };
  }

  const completedTradeUserIds = await Trade.distinct("user", {
    user: { $in: directUserIds },
    status: "settled"
  });

  return {
    activeTradeReferrals: completedTradeUserIds.length
  };
};

const findReferralRewardTransaction = async (userId, notes) => {
  return Transaction.findOne({
    user: userId,
    type: "referral",
    status: "approved",
    note: { $in: notes }
  });
};

const createReferralRewardTransactionIfMissing = async ({
  userId,
  amount,
  note,
  notesToCheck
}) => {
  const existingTransaction = await findReferralRewardTransaction(
    userId,
    notesToCheck
  );

  if (existingTransaction) return existingTransaction;

  return Transaction.create({
    user: userId,
    type: "referral",
    amount,
    status: "approved",
    note,
    approvedAt: new Date()
  });
};

const creditDepositReferralRewardIfEligible = async (
  user,
  activeDepositReferrals
) => {
  const notesToCheck = [
    DEPOSIT_REFERRAL_REWARD_NOTE,
    OLD_DEPOSIT_REFERRAL_REWARD_NOTE
  ];

  const existingTransaction = await findReferralRewardTransaction(
    user._id,
    notesToCheck
  );

  if (existingTransaction) {
    return {
      credited: true
    };
  }

  if (user.premiumRewardCredited) {
    await createReferralRewardTransactionIfMissing({
      userId: user._id,
      amount: DEPOSIT_REFERRAL_REWARD_AMOUNT,
      note: DEPOSIT_REFERRAL_REWARD_NOTE,
      notesToCheck
    });

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

  await createReferralRewardTransactionIfMissing({
    userId: user._id,
    amount: DEPOSIT_REFERRAL_REWARD_AMOUNT,
    note: DEPOSIT_REFERRAL_REWARD_NOTE,
    notesToCheck
  });

  return {
    credited: true
  };
};

const creditTradeReferralRewardIfEligible = async (
  user,
  activeTradeReferrals
) => {
  const notesToCheck = [
    TRADE_REFERRAL_REWARD_NOTE,
    OLD_TRADE_REFERRAL_REWARD_NOTE
  ];

  const existingTransaction = await findReferralRewardTransaction(
    user._id,
    notesToCheck
  );

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

  await createReferralRewardTransactionIfMissing({
    userId: user._id,
    amount: TRADE_REFERRAL_REWARD_AMOUNT,
    note: TRADE_REFERRAL_REWARD_NOTE,
    notesToCheck
  });

  return {
    credited: true
  };
};

const getReferralReason = (note) => {
  const text = String(note || "").toLowerCase();

  if (text.includes("direct")) return "Direct Referral";
  if (text.includes("indirect") || text.includes("sub")) return "Indirect Referral";
  if (text.includes("20")) return "20 Refer Complete";
  if (text.includes("5")) return "5 Refer Complete";

  return "Referral Bonus";
};

const getReferralTransactions = async (userId) => {
  const transactions = await Transaction.find({
    user: userId,
    type: "referral"
  })
    .select("_id amount status note approvedAt createdAt")
    .sort({ createdAt: -1 })
    .limit(100);

  return transactions.map((transaction) => ({
    id: transaction._id,
    amount: Number(transaction.amount || 0),
    status: transaction.status || "approved",
    reason: getReferralReason(transaction.note),
    note: transaction.note || "",
    approvedAt: transaction.approvedAt || null,
    createdAt: transaction.createdAt || null
  }));
};

exports.getReferral = async (req, res) => {
  try {
    const referralCode = await ensureReferralCode(req.user);

    const totalApprovedDeposit = await getTotalApprovedDeposit(req.user._id);
    const tier = getTierByDeposit(totalApprovedDeposit);
    const { directCommission, indirectCommission } = getCommissionByTier(tier);

    const directUserIds = await getDirectUserIds(req.user._id);

    const directUsers = directUserIds.length;

    const subUsers = directUserIds.length
      ? await User.countDocuments({
          referredBy: { $in: directUserIds }
        })
      : 0;

    const { activeDepositReferrals } =
      await getDepositReferralStats(directUserIds);

    const { activeTradeReferrals } =
      await getTradeReferralStats(directUserIds);

    const depositRewardResult = await creditDepositReferralRewardIfEligible(
      req.user,
      activeDepositReferrals
    );

    const tradeRewardResult = await creditTradeReferralRewardIfEligible(
      req.user,
      activeTradeReferrals
    );

    const requiredReferrals = DEPOSIT_REFERRAL_REQUIRED_COUNT;
    const activeReferrals = activeDepositReferrals;
    const remainingReferrals = Math.max(requiredReferrals - activeReferrals, 0);

    const tradeRequiredReferrals = TRADE_REFERRAL_REQUIRED_COUNT;
    const completedTradeReferrals = activeTradeReferrals;
    const tradeRemainingReferrals = Math.max(
      tradeRequiredReferrals - completedTradeReferrals,
      0
    );

    const referralTransactions = await getReferralTransactions(req.user._id);

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

      referralTransactions,

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