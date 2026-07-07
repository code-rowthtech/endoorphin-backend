const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
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
});

module.exports = mongoose.model('Category', categorySchema);
