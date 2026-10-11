const express = require("express");
const router = express.Router();

const { sendEmail } = require("../controllers/emailController");

// ✅ route define
router.post("/send-email", sendEmail);

module.exports = router;