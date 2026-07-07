const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VenueProfile',
      default: null,
    },
    trainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrainerProfile',
      default: null,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model('Service', serviceSchema);
