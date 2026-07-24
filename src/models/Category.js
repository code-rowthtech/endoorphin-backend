const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
  },
  icon: {
    type: String,
    default: null,
  },
  type: {
    type: String,
    enum: {
      values: ['trainer', 'venue'],
      message: 'Category type must be one of: trainer, venue',
    },
    required: [true, 'Category type is required'],
  },
  isCustom: {
    type: Boolean,
    default: false,
  },
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainerProfile',
    default: null,
  },
  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VenueProfile',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
