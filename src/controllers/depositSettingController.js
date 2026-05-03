const DepositSetting = require("../models/DepositSetting");

const DEFAULT_CHAINS = ["TRC20", "BEP20 (BNB)", "ERC20", "Polygon", "Solana"];

const ensureDefaultSettings = async () => {
  for (const chain of DEFAULT_CHAINS) {
    await DepositSetting.findOneAndUpdate(
      { chain },
      { $setOnInsert: { chain, address: "", qrImage: "", isActive: true } },
      { upsert: true, new: true }
    );
  }
};

// USER + ADMIN: GET ALL SETTINGS
exports.getDepositSettings = async (req, res) => {
  try {
    await ensureDefaultSettings();

    const settings = await DepositSetting.find({ isActive: true }).sort({
      createdAt: 1
    });

    res.json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch deposit settings"
    });
  }
};

// ADMIN: UPDATE SINGLE CHAIN SETTING
exports.updateDepositSetting = async (req, res) => {
  try {
    const { chain } = req.params;
    const { address } = req.body;

    if (!DEFAULT_CHAINS.includes(chain)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blockchain"
      });
    }

    const qrImage = req.file?.path;

    const updateData = {
      address: address || ""
    };

    if (qrImage) {
      updateData.qrImage = qrImage;
    }

    const setting = await DepositSetting.findOneAndUpdate(
      { chain },
      updateData,
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Deposit setting updated",
      setting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update deposit setting"
    });
  }
};