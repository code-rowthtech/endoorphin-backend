const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VenueProfile',
      required: [true, 'Venue reference is required'],
    },
    name: {
      type: String,
      required: [true, 'Staff name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ['Trainer', 'Coach', 'Manager'],
        message: 'Role must be one of: Trainer, Coach, Manager',
      },
    },
    photo: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },
    expertise: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model('Staff', staffSchema);
