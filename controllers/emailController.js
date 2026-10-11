const { EmailClient } = require("@azure/communication-email");

// ✅ apna FULL connection string yahan daalo
const connectionString = `endpoint=https://shub-communication-service.unitedstates.communication.azure.com/;accesskey=${process.env.EMAIL_KEY}`;

exports.sendEmail = async (req, res) => {
  const { email, subject, message, htmlContent, attachments } = req.body;

  try {
    const client = new EmailClient(connectionString);

    // Prepare email content
    const emailMessage = {
      senderAddress: "DoNotReply@2db8073f-4cc6-4d65-a894-99d4f07012a4.azurecomm.net",
      content: {
        subject: subject || "Hello from ACS",
        plainText: message || "This is a test email",
        html: htmlContent || `<html><body>${message || "This is a test email"}</body></html>`,
      },
      recipients: {
        to: [{ address: email }],
      },
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailMessage.attachments = attachments.map(attachment => ({
        name: attachment.filename,
        contentType: attachment.contentType,
        contentInBase64: attachment.content, // Base64 encoded content
      }));
    }

    const poller = await client.beginSend(emailMessage);
    const result = await poller.pollUntilDone();

    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      result: {
        messageId: result.messageId,
        status: result.status,
      },
    });
  } catch (error) {
    console.error("Email Error:", error);
    res.status(500).json({
      success: false,
      message: "Email failed",
      error: error.message,
    });
  }
};