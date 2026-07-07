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
    required: [true, 'Venue reference is required'],
  },
  isCustom: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('Amenity', amenitySchema);
