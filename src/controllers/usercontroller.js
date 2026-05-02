exports.getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      kycStatus: req.user.kycStatus,
      walletBalance: req.user.walletBalance
    },
    kycStatus: req.user.kycStatus
  });
};

exports.submitKyc = async (req, res) => {
  try {
    const { fullName, dob, address, panNumber, aadhaarNumber } = req.body;

    if (!fullName || !dob || !address || !panNumber || !aadhaarNumber) {
      return res.status(400).json({
        success: false,
        message: "All KYC fields are required"
      });
    }

    req.user.kyc = {
      fullName,
      dob,
      address,
      panNumber,
      aadhaarNumber
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