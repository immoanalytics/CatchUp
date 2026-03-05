const nodemailer = require('nodemailer');

// Create transporter based on environment
// In development: logs to console
// In production: uses SMTP settings from environment variables
let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    // Production: use real SMTP
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development: use ethereal test account or console logging
    transporter = {
      sendMail: async (options) => {
        console.log('\n========== EMAIL (dev mode) ==========');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('Text:', options.text);
        console.log('=======================================\n');
        return { messageId: 'dev-' + Date.now() };
      },
    };
  }

  return transporter;
}

async function sendPasswordResetCode(email, code) {
  const transport = getTransporter();

  const mailOptions = {
    from: process.env.SMTP_FROM || 'CatchUp <noreply@catchup.app>',
    to: email,
    subject: 'Your CatchUp Password Reset Code',
    text: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #6C63FF;">CatchUp Password Reset</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 15 minutes.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  return transport.sendMail(mailOptions);
}

module.exports = { sendPasswordResetCode };
