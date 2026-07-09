/**
 * Generates a 6-digit OTP.
 * In development mode, always returns "123456" for easy testing.
 * In production, returns a random 6-digit number.
 */
const generateOTP = () => {
  // Random 6-digit OTP
  return String(Math.floor(100000 + Math.random() * 900000));
};

module.exports = generateOTP;
