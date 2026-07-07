const mongoose = require('mongoose');

const venueProfileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner reference is required'],
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    aboutVenue: {
      type: String,
      trim: true,
    },
    venueImages: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          return arr.length <= 15;
        },
        message: 'Maximum 15 venue images allowed',
      },
    },
    address: {
      streetAddress: { type: String },
      area: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
      },
    },
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
    ],
    amenities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Amenity',
      },
    ],
    staff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff',
      },
    ],
    profileCompletionPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index on location for geo queries
venueProfileSchema.index({ location: '2dsphere' });

// Method to calculate profile completion percentage
venueProfileSchema.methods.calculateCompletion = function () {
  const fields = [
    this.companyName,
    this.phoneNumber,
    this.email,
    this.aboutVenue,
    this.logo,
    this.venueImages && this.venueImages.length > 0,
    this.address && this.address.city,
    this.services && this.services.length > 0,
    this.amenities && this.amenities.length > 0,
    this.staff && this.staff.length > 0,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
};

module.exports = mongoose.model('VenueProfile', venueProfileSchema);
