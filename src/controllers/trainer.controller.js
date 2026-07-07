const mongoose = require('mongoose');
const TrainerProfile = require('../models/TrainerProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');
const { metersToMiles, buildGeoNearStage } = require('../utils/distanceCalculator');

/**
 * POST /api/trainers
 * Create trainer profile (protected, role=trainer)
 */
const createTrainerProfile = asyncWrapper(async (req, res) => {
  const existing = await TrainerProfile.findOne({ user: req.user._id });
  if (existing) {
    return sendError(res, 409, 'Trainer profile already exists for this user.');
  }

  const profileData = {
    user: req.user._id,
    fullName: req.body.fullName || req.user.fullName,
    yearsOfExperience: req.body.yearsOfExperience,
    shortBio: req.body.shortBio,
    categories: req.body.categories,
    serviceTypes: req.body.serviceTypes,
  };

  if (req.file) {
    profileData.profileImage = getFileUrl(req, req.file.filename);
  }

  const profile = await TrainerProfile.create(profileData);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 201, 'Trainer profile created successfully.', { profile });
});

/**
 * GET /api/trainers/:id
 */
const getTrainerById = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id).populate('user', 'fullName phoneNumber profileImage role');
  if (!profile) {
    return sendError(res, 404, 'Trainer profile not found.');
  }
  return sendSuccess(res, 200, 'Trainer profile fetched successfully.', { profile });
});

/**
 * PUT /api/trainers/:id
 */
const updateTrainerProfile = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) {
    return sendError(res, 404, 'Trainer profile not found.');
  }
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'You are not authorized to update this profile.');
  }

  const allowedFields = ['fullName', 'yearsOfExperience', 'shortBio', 'categories', 'serviceTypes'];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) profile[field] = req.body[field];
  });

  if (req.file) {
    profile.profileImage = getFileUrl(req, req.file.filename);
  }

  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 200, 'Trainer profile updated successfully.', { profile });
});

/**
 * DELETE /api/trainers/:id
 */
const deleteTrainerProfile = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) {
    return sendError(res, 404, 'Trainer profile not found.');
  }
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'You are not authorized to delete this profile.');
  }
  await profile.deleteOne();
  return sendSuccess(res, 200, 'Trainer profile deleted successfully.', {});
});

/**
 * GET /api/trainers
 * List/search trainers with filters
 */
const listTrainers = asyncWrapper(async (req, res) => {
  const {
    search,
    category,
    serviceType,
    lat,
    lng,
    minDistance = 0,
    maxDistance = 50,
    page = 1,
    limit = 10,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  // If geo params provided, use aggregation pipeline
  if (lat && lng) {
    const pipeline = [];

    pipeline.push(
      buildGeoNearStage(
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(maxDistance),
        parseFloat(minDistance),
        'distanceInMeters',
        'serviceAreas.location'
      )
    );

    const matchStage = {};
    if (search) {
      matchStage.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { shortBio: { $regex: search, $options: 'i' } },
        { categories: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) matchStage.categories = { $in: [category] };
    if (serviceType) matchStage.serviceTypes = { $in: [serviceType] };

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $addFields: {
        distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] },
      },
    });

    pipeline.push(
      { $skip: skip },
      { $limit: limitNum }
    );

    const trainers = await TrainerProfile.aggregate(pipeline);
    return sendSuccess(res, 200, 'Trainers fetched successfully.', {
      trainers,
      pagination: { page: pageNum, limit: limitNum, total: trainers.length },
    });
  }

  // Non-geo search
  const query = {};
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { shortBio: { $regex: search, $options: 'i' } },
      { categories: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) query.categories = { $in: [category] };
  if (serviceType) query.serviceTypes = { $in: [serviceType] };

  const total = await TrainerProfile.countDocuments(query);
  const trainers = await TrainerProfile.find(query)
    .populate('user', 'fullName phoneNumber profileImage')
    .skip(skip)
    .limit(limitNum)
    .lean();

  return sendSuccess(res, 200, 'Trainers fetched successfully.', {
    trainers,
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

/**
 * POST /api/trainers/:id/certifications
 * Upload a certification file
 */
const addCertification = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const { name } = req.body;
  if (!name) return sendError(res, 400, 'Certification name is required.');

  const certification = { name, uploadedAt: new Date() };
  if (req.file) {
    certification.fileUrl = getFileUrl(req, req.file.filename);
  }

  profile.certifications.push(certification);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 201, 'Certification added successfully.', {
    certification: profile.certifications[profile.certifications.length - 1],
  });
});

/**
 * DELETE /api/trainers/:id/certifications/:certId
 */
const deleteCertification = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const certIndex = profile.certifications.findIndex(
    (c) => c._id.toString() === req.params.certId
  );
  if (certIndex === -1) return sendError(res, 404, 'Certification not found.');

  profile.certifications.splice(certIndex, 1);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 200, 'Certification deleted successfully.', {});
});

/**
 * POST /api/trainers/:id/service-areas
 */
const addServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const { label, streetAddress, area, city, state, pincode, lng, lat } = req.body;

  const serviceArea = {
    label,
    streetAddress,
    area,
    city,
    state,
    pincode,
    location: {
      type: 'Point',
      coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0],
    },
  };

  profile.serviceAreas.push(serviceArea);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 201, 'Service area added successfully.', {
    serviceArea: profile.serviceAreas[profile.serviceAreas.length - 1],
  });
});

/**
 * PUT /api/trainers/:id/service-areas/:areaId
 */
const updateServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const area = profile.serviceAreas.id(req.params.areaId);
  if (!area) return sendError(res, 404, 'Service area not found.');

  const { label, streetAddress, city, state, pincode, lng, lat } = req.body;
  if (label !== undefined) area.label = label;
  if (streetAddress !== undefined) area.streetAddress = streetAddress;
  if (city !== undefined) area.city = city;
  if (state !== undefined) area.state = state;
  if (pincode !== undefined) area.pincode = pincode;
  if (lng !== undefined || lat !== undefined) {
    area.location.coordinates = [
      parseFloat(lng) || area.location.coordinates[0],
      parseFloat(lat) || area.location.coordinates[1],
    ];
  }

  await profile.save();

  return sendSuccess(res, 200, 'Service area updated successfully.', { serviceArea: area });
});

/**
 * DELETE /api/trainers/:id/service-areas/:areaId
 */
const deleteServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const areaIndex = profile.serviceAreas.findIndex(
    (a) => a._id.toString() === req.params.areaId
  );
  if (areaIndex === -1) return sendError(res, 404, 'Service area not found.');

  profile.serviceAreas.splice(areaIndex, 1);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 200, 'Service area deleted successfully.', {});
});

/**
 * POST /api/trainers/:id/gallery
 * Upload gallery images (multiple)
 */
const addGalleryImages = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  if (!req.files || req.files.length === 0) {
    return sendError(res, 400, 'No images uploaded.');
  }

  const newImages = req.files.map((file) => getFileUrl(req, file.filename));
  profile.galleryImages.push(...newImages);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 201, 'Gallery images added successfully.', {
    galleryImages: profile.galleryImages,
    addedCount: newImages.length,
  });
});

/**
 * DELETE /api/trainers/:id/gallery/:imageId
 * imageId here is actually the index or the encoded filename — we match by URL segment
 */
const deleteGalleryImage = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  // imageId is the index in the gallery array
  const imageIndex = parseInt(req.params.imageId, 10);
  if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= profile.galleryImages.length) {
    return sendError(res, 404, 'Gallery image not found.');
  }

  profile.galleryImages.splice(imageIndex, 1);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 200, 'Gallery image deleted successfully.', {
    galleryImages: profile.galleryImages,
  });
});

/**
 * GET /api/trainers/:id/dashboard
 */
const getTrainerDashboard = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findById(req.params.id);
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');

  return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
    profileCompletionPercent: profile.profileCompletionPercent,
    serviceAreaCount: profile.serviceAreas.length,
    servicesOfferedCount: profile.serviceTypes.length,
    certificationsCount: profile.certifications.length,
    galleryImagesCount: profile.galleryImages.length,
    categoriesCount: profile.categories.length,
  });
});

module.exports = {
  createTrainerProfile,
  getTrainerById,
  updateTrainerProfile,
  deleteTrainerProfile,
  listTrainers,
  addCertification,
  deleteCertification,
  addServiceArea,
  updateServiceArea,
  deleteServiceArea,
  addGalleryImages,
  deleteGalleryImage,
  getTrainerDashboard,
};
