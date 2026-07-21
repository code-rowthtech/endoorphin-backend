const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const OTP = require('../models/OTP');
const generateOTP = require('../utils/generateOTP');
const generateToken = require('../utils/generateToken');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { sendOtp } = require('../middlewares/twilio.middleware');

/**
 * POST /api/auth/send-otp
 * Generates and stores a hashed OTP for the given phone number.
 */
const sendOTP = asyncWrapper(async (req, res) => {
  try {
    const { phoneNumber, countryCode = '+91', type } = req.body;

    if (type === 'login') {
      const existingUser = await User.findOne({ phoneNumber });
      if (!existingUser) {
        return sendError(res, 400, 'User not found, Please Sign Up first');
      }
    }

    // Invalidate any existing active OTPs for this number
    await OTP.deleteMany({ phoneNumber });

    // Generate OTP
    const otpCode = generateOTP();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Hash OTP before storing
    const salt = await bcrypt.genSalt(10);
    const hashedOTP = await bcrypt.hash(otpCode, salt);

    await OTP.create({
      phoneNumber,
      otp: hashedOTP,
      expiresAt,
    });

    // Send OTP via Twilio SMS
    const fullPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `${countryCode}${phoneNumber}`;
    try {
      await sendOtp(fullPhoneNumber, otpCode);
    } catch (twilioError) {
      console.error('Twilio SMS delivery failed:', twilioError.message);
      // OTP is still stored; we let dev-mode response expose the code below
    }

    const responseData = {
      phoneNumber,
      countryCode,
      expiresAt,
      otpCode
    };

    // Only expose OTP in dev mode
    if (process.env.NODE_ENV === 'development') {
      responseData.otp = otpCode;
      responseData.note = 'OTP is shown only in development mode';
    }

    return sendSuccess(res, 200, 'OTP sent successfully', responseData);
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "internal server error" })

  }
});

/**
 * POST /api/auth/verify-otp
 * Validates OTP, creates user if not exists, returns JWT.
 */
const verifyOTP = asyncWrapper(async (req, res) => {
  const { phoneNumber, otp } = req.body;

  // Find the most recent unused OTP for this phone
  const otpRecord = await OTP.findOne({
    phoneNumber,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return sendError(res, 400, 'OTP has expired or does not exist. Please request a new OTP.');
  }

  // Compare OTP
  const isMatch = await bcrypt.compare(otp, otpRecord.otp);
  if (!isMatch) {
    return sendError(res, 400, 'Invalid OTP. Please try again.');
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // Find or create user
  let user = await User.findOne({ phoneNumber });
  const isNewUser = !user;

  if (!user) {
    user = await User.create({ phoneNumber, isVerified: true });
  } else {
    user.isVerified = true;
    await user.save();
    
    if (user.role === 'trainer') {
      const trainerProfile = await TrainerProfile.findOne({ user: user._id });
      if (trainerProfile) {
        if (trainerProfile.approvalStatus === 'pending') {
          return sendError(res, 403, 'Your trainer profile is currently pending admin approval.');
        }
        if (trainerProfile.approvalStatus === 'rejected') {
          return sendError(res, 403, `Your trainer profile has been rejected. Reason: ${trainerProfile.rejectionReason || 'Please contact support.'}`);
        }
      }
    }
  }

  const token = generateToken(user._id);

  return sendSuccess(res, 200, isNewUser ? 'OTP verified. Please complete registration.' : 'Login successful.', {
    token,
    user,
    isNewUser,
  });
});

/**
 * POST /api/auth/register
 * Completes user registration after OTP verify (sets fullName, role).
 */
const register = asyncWrapper(async (req, res) => {
  const { phoneNumber, fullName, role } = req.body;

  const user = await User.findOne({ phoneNumber, isVerified: true });
  if (!user) {
    return sendError(res, 400, 'Phone number not verified. Please verify your OTP first.');
  }

  if (user.role) {
    return sendError(res, 400, 'User is already registered. Role cannot be changed.');
  }

  user.fullName = fullName;
  user.role = role;
  await user.save();

  const token = generateToken(user._id);

  return sendSuccess(res, 201, 'Registration successful.', { token, user });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
const getMe = asyncWrapper(async (req, res) => {
  const user = await User.findById(req.user._id).select('-__v');
  return sendSuccess(res, 200, 'User fetched successfully.', { user });
});

/**
 * POST /api/auth/logout
 * Stateless logout — client should discard token.
 */
const logout = asyncWrapper(async (req, res) => {
  return sendSuccess(res, 200, 'Logged out successfully. Please discard your token on the client side.', {});
});

module.exports = { sendOTP, verifyOTP, register, getMe, logout };
