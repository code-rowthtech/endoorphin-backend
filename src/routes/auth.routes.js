const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { sendOTP, verifyOTP, register, getMe, logout } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// POST /api/auth/send-otp
router.post(
  '/send-otp',
  [
    body('phoneNumber')
      .notEmpty().withMessage('Phone number is required.')
      .matches(/^[6-9]\d{9}$|^\+?[1-9]\d{6,14}$/).withMessage('Invalid phone number format.'),
    body('countryCode').optional().notEmpty().withMessage('Country code cannot be empty.'),
  ],
  validate,
  sendOTP
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  [
    body('phoneNumber').notEmpty().withMessage('Phone number is required.'),
    body('otp')
      .notEmpty().withMessage('OTP is required.')
      .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
      .isNumeric().withMessage('OTP must be numeric.'),
  ],
  validate,
  verifyOTP
);

// POST /api/auth/register
router.post(
  '/register',
  [
    body('phoneNumber').notEmpty().withMessage('Phone number is required.'),
    body('fullName').notEmpty().withMessage('Full name is required.').trim(),
    body('role')
      .notEmpty().withMessage('Role is required.')
      .isIn(['explorer', 'trainer', 'venue_owner']).withMessage('Role must be one of: explorer, trainer, venue_owner.'),
  ],
  validate,
  register
);

// GET /api/auth/me (protected)
router.get('/me', protect, getMe);

// POST /api/auth/logout (protected)
router.post('/logout', protect, logout);

module.exports = router;
