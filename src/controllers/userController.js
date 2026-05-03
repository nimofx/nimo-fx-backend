const Transaction = require("../models/Transaction");
const User = require("../models/User");

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
  if (tier === 5) {
    return { directCommission: 15, indirectCommission: 5 };
  }

  if (tier === 4) {
    return { directCommission: 12, indirectCommission: 4 };
  }

  if (tier === 3) {
    return { directCommission: 10, indirectCommission: 3 };
  }

  if (tier === 2) {
    return { directCommission: 9, indirectCommission: 2 };
  }

  return { directCommission: 8, indirectCommission: 2 };
};

const getActiveReferralCount = async (userIds) => {
  if (!userIds || userIds.length === 0) return 0;

  const result = await Transaction.aggregate([
    {
      $match: {
        user: { $in: userIds },
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

exports.getMe = async (req, res) => {
  try {
    const totalApprovedDeposit = await getTotalApprovedDeposit(req.user._id);

    res.json({
      success: true,
      totalApprovedDeposit,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        roles: req.user.roles || ["user"],
        kycStatus: req.user.kycStatus,
        kyc: req.user.kyc || null,
        walletBalance: req.user.walletBalance,
        lockBalance: req.user.lockBalance || 0,
        lockUntil: req.user.lockUntil || null,
        totalApprovedDeposit
      },
      kycStatus: req.user.kycStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile"
    });
  }
};

exports.getWallet = async (req, res) => {
  try {
    const walletBalance = Number(req.user.walletBalance || 0);
    const lockBalance = Number(req.user.lockBalance || 0);

    let lockDaysRemaining = 0;

    if (req.user.lockUntil) {
      const now = new Date();
      const lockUntil = new Date(req.user.lockUntil);

      if (lockUntil > now) {
        lockDaysRemaining = Math.ceil(
          (lockUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    res.json({
      totalBalance: walletBalance + lockBalance,
      withdrawableBalance: walletBalance,
      lockBalance,
      lockDaysRemaining
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet"
    });
  }
};

exports.submitKyc = async (req, res) => {
  try {
    const {
      dob,
      address1,
      address2,
      district,
      state,
      pin,
      aadhaar
    } = req.body;

    if (!dob || !address1 || !district || !state || !pin || !aadhaar) {
      return res.status(400).json({
        success: false,
        message: "All KYC fields are required"
      });
    }

    const aadhaarFront = req.files?.aadhaarFront?.[0]?.path || "";
    const aadhaarBack = req.files?.aadhaarBack?.[0]?.path || "";

    if (!aadhaarFront || !aadhaarBack) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar front and back images are required"
      });
    }

    req.user.kyc = {
      dob,
      address1,
      address2: address2 || "",
      district,
      state,
      pin,
      aadhaar,
      aadhaarFront,
      aadhaarBack
    };

    req.user.kycStatus = "pending";

    await req.user.save();

    res.json({
      success: true,
      message: "KYC submitted successfully",
      kycStatus: req.user.kycStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "KYC submission failed"
    });
  }
};

exports.getReferral = async (req, res) => {
  try {
    const referralCode = await ensureReferralCode(req.user);

    const totalApprovedDeposit = await getTotalApprovedDeposit(req.user._id);
    const tier = getTierByDeposit(totalApprovedDeposit);
    const { directCommission, indirectCommission } = getCommissionByTier(tier);

    const directUsersList = await User.find({
      referredBy: req.user._id
    }).select("_id");

    const directUserIds = directUsersList.map((user) => user._id);

    const directUsers = directUserIds.length;

    const subUsers = directUserIds.length
      ? await User.countDocuments({
          referredBy: { $in: directUserIds }
        })
      : 0;

    const activeReferrals = await getActiveReferralCount(directUserIds);

    const requiredReferrals = 5;

    if (activeReferrals >= requiredReferrals && !req.user.premiumRewardCredited) {
      req.user.premiumRewardUnlocked = true;
      req.user.premiumRewardCredited = true;
      req.user.walletBalance = Number(req.user.walletBalance || 0) + 100;
      req.user.referralBonus = Number(req.user.referralBonus || 0) + 100;

      await req.user.save();
    }

    res.json({
      success: true,
      referralCode,
      referredBy: req.user.referredByCode || "",
      isReferralLocked: Boolean(req.user.isReferralLocked),

      directUsers,
      subUsers,
      activeReferrals,
      requiredReferrals,

      referralBonus: Number(req.user.referralBonus || 0),
      totalApprovedDeposit,
      tier,

      directCommission,
      indirectCommission,

      premiumRewardUnlocked: Boolean(req.user.premiumRewardUnlocked)
    });
  } catch (error) {
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
    res.status(500).json({
      success: false,
      message: "Failed to apply referral code"
    });
  }
};