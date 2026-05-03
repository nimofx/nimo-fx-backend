exports.getMe = async (req, res) => {
  res.json({
    success: true,
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
      lockUntil: req.user.lockUntil || null
    },
    kycStatus: req.user.kycStatus
  });
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