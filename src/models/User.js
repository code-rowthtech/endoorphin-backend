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
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
    },
    countryCode: {
      type: String,
      default: '+91',
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ['explorer', 'trainer', 'venue_owner', 'super_admin', 'general_manager'],
        message: 'Role must be one of: explorer, trainer, venue_owner, super_admin, general_manager',
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
    isDeleted: {
      type: Boolean,
      default: false,
    },
    preferredLanguage: {
      type: String,
      default: 'en',
    },
    managedVenue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VenueProfile',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
