/**
 * Dummy email service
 * Requires nodemailer and an SMTP configuration to actually send emails.
 */
const sendEmail = async (toEmail, subject, text) => {
  console.log(`\n--- MOCK EMAIL ---`);
  console.log(`To: ${toEmail}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${text}`);
  console.log(`------------------\n`);
  // TODO: Implement actual email sending logic using nodemailer or a third-party API (SendGrid, AWS SES)
  return true;
};

module.exports = {
  sendEmail,
};
