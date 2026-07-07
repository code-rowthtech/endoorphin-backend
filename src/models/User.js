const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: '+91',
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ['explorer', 'trainer', 'venue_owner'],
        message: 'Role must be one of: explorer, trainer, venue_owner',
      },
    },
    profileImage: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
