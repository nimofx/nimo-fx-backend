const Support = require("../models/Support");

// ================= USER SIDE =================

// 🔥 CREATE TICKET
exports.createSupportTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required"
      });
    }

    const screenshot = req.file?.path || "";

    const ticket = await Support.create({
      user: req.user._id,
      subject,
      message,
      screenshot
    });

    res.json({
      success: true,
      message: "Support ticket created",
      ticket
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create ticket"
    });
  }
};

// 🔥 GET MY TICKETS
exports.getMySupportTickets = async (req, res) => {
  try {
    const tickets = await Support.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets"
    });
  }
};

// ================= ADMIN SIDE =================

// 🔥 GET ALL TICKETS
exports.getAllSupportTickets = async (req, res) => {
  try {
    const tickets = await Support.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets"
    });
  }
};

// 🔥 REPLY TO TICKET
exports.replyToSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Reply is required"
      });
    }

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    ticket.adminReply = reply;
    ticket.status = "replied";
    ticket.repliedAt = new Date();

    await ticket.save();

    res.json({
      success: true,
      message: "Reply sent"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Reply failed"
    });
  }
};

// 🔥 CLOSE TICKET
exports.closeSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Support.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    ticket.status = "closed";
    ticket.closedAt = new Date();

    await ticket.save();

    res.json({
      success: true,
      message: "Ticket closed"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Close failed"
    });
  }
};