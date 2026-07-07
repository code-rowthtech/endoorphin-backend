const mongoose = require('mongoose');

const certificationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fileUrl: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

const serviceAreaSchema = new mongoose.Schema({
  label: { type: String },
  streetAddress: { type: String },
  area: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
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
});

const trainerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },
    shortBio: {
      type: String,
      trim: true,
    },
    profileImage: {
      type: String,
      default: null,
    },
    categories: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [certificationSchema],
      default: [],
    },
    serviceAreas: {
      type: [serviceAreaSchema],
      default: [],
    },
    serviceTypes: {
      type: [String],
      enum: {
        values: ['In-Person', 'Home Visit', 'Gym Facility'],
        message: 'Service type must be one of: In-Person, Home Visit, Gym Facility',
      },
      default: [],
    },
    galleryImages: {
      type: [String],
      default: [],
    },
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

// 2dsphere index on service areas location for geo queries
trainerProfileSchema.index({ 'serviceAreas.location': '2dsphere' });

// Method to calculate profile completion percentage
trainerProfileSchema.methods.calculateCompletion = function () {
  const fields = [
    this.fullName,
    this.yearsOfExperience !== undefined && this.yearsOfExperience !== null,
    this.shortBio,
    this.profileImage,
    this.categories && this.categories.length > 0,
    this.certifications && this.certifications.length > 0,
    this.serviceAreas && this.serviceAreas.length > 0,
    this.serviceTypes && this.serviceTypes.length > 0,
    this.galleryImages && this.galleryImages.length > 0,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
};

module.exports = mongoose.model('TrainerProfile', trainerProfileSchema);
