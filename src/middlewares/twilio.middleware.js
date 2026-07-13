const twilio = require('twilio');

/**
 * Utility middleware/function to send an OTP via Twilio
 * Note: This function is currently not called anywhere as per requirements.
 * Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are set in your .env file.
 * 
 * @param {string} toPhoneNumber - The recipient's phone number (e.g., '+1234567890')
 * @param {string|number} otp - The OTP to send
 * @returns {Promise<object>} The Twilio message response object
 */
const sendOtp = async (toPhoneNumber, otp) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials are not properly configured in environment variables.');
    }

    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: `Your verification code is: ${otp}`,
      from: twilioPhoneNumber,
      to: toPhoneNumber,
    });

    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error) {
    console.error('Error sending OTP via Twilio:', error);
    throw new Error('Failed to send OTP via Twilio');
  }
};

module.exports = {
  sendOtp,
};
