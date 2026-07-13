const mongoose = require('mongoose');

const serviceTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service type name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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

module.exports = mongoose.model('ServiceType', serviceTypeSchema);
