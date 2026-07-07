/**
 * Generates a 4-digit OTP.
 * In development mode, always returns "1234" for easy testing.
 * In production, returns a random 4-digit number.
 */
const generateOTP = () => {
  if (process.env.NODE_ENV === 'development') {
    // Fixed OTP for easy testing in dev
    return '1234';
  }
  // Random 4-digit OTP for production
  return String(Math.floor(1000 + Math.random() * 9000));
};

module.exports = generateOTP;
