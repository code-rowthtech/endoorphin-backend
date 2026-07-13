const mongoose = require('mongoose');

const amenitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Amenity name is required'],
    trim: true,
  },
  icon: {
    type: String,
    default: null,
  },
  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VenueProfile',
    default: null,
  },
  isCustom: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('Amenity', amenitySchema);
