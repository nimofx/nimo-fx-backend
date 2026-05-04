const Transaction = require("../models/Transaction");

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

const formatLockEntries = (user) => {
  const entries = Array.isArray(user.lockEntries) ? user.lockEntries : [];

  return entries
    .filter((entry) => Number(entry.amount || 0) > 0)
    .map((entry) => ({
      amount: Number(entry.amount || 0),
      lockedAt: entry.lockedAt || null,
      unlockAt: entry.unlockAt || null,
      daysRemaining: calculateDaysRemaining(entry.unlockAt),
      source: entry.source || "deposit",
      transaction: entry.transaction || null
    }));
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

exports.getMe = async (req, res) => {
  try {
    await autoUnlockExpiredLockEntries(req.user);

    const totalApprovedDeposit = await getTotalApprovedDeposit(req.user._id);
    const lockEntries = formatLockEntries(req.user);

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
        lockEntries,
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
    await autoUnlockExpiredLockEntries(req.user);

    const walletBalance = Number(req.user.walletBalance || 0);
    const lockBalance = Number(req.user.lockBalance || 0);
    const lockEntries = formatLockEntries(req.user);

    const lockDaysRemaining =
      lockEntries.length > 0
        ? Math.max(...lockEntries.map((entry) => Number(entry.daysRemaining || 0)))
        : 0;

    res.json({
      totalBalance: roundAmount(walletBalance + lockBalance),
      withdrawableBalance: walletBalance,
      lockBalance,
      lockDaysRemaining,
      lockEntries
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