const TrainerProfile = require('../models/TrainerProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');
const { buildGeoNearStage } = require('../utils/distanceCalculator');

const parseJSONField = (field) => {
  if (!field) return field;
  if (typeof field === 'string') {
    try {
      field = JSON.parse(field);
    } catch (e) {
      return field;
    }
  }
  // If it's an array, parse each element that might be a JSON string
  if (Array.isArray(field)) {
    return field.map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch (e) {
          return item;
        }
      }
      return item;
    });
  }
  return field;
};

const ensureArray = (value) => {
  if (value === undefined || value === null) return value; // Let schema defaults apply if undefined
  return Array.isArray(value) ? value : [value];
};

/**
 * POST /api/trainers
 * Create trainer profile (protected, role=trainer)
 */
const createTrainerProfile = asyncWrapper(async (req, res) => {
  try {
    const existing = await TrainerProfile.findOne({ user: req.user._id });
    if (existing) {
      return sendError(res, 409, 'Trainer profile already exists for this user.');
    }

    let parsedCategories = parseJSONField(req.body.categories);
    let parsedServiceTypes = parseJSONField(req.body.serviceTypes);
    let parsedServiceAreas = parseJSONField(req.body.serviceAreas);
    let parsedCertifications = parseJSONField(req.body.certifications);
    let parsedGalleryImages = parseJSONField(req.body.galleryImages);

    // If it parsed into a single object (or was passed as a single string), wrap in array
    if (req.body.categories !== undefined) {
      parsedCategories = ensureArray(parsedCategories);
    }
    if (req.body.serviceTypes !== undefined) {
      parsedServiceTypes = ensureArray(parsedServiceTypes);
    }
    if (req.body.serviceAreas !== undefined) {
      parsedServiceAreas = ensureArray(parsedServiceAreas).map(area => ({
        ...area,
        location: {
          type: 'Point',
          coordinates: [parseFloat(area.lng) || 0, parseFloat(area.lat) || 0]
        }
      }));
    }
    if (req.body.certifications !== undefined) {
      parsedCertifications = ensureArray(parsedCertifications).map(cert => {
        const nameFromUrl = cert.fileUrl ? cert.fileUrl.split('/').pop().replace(/\.[^/.]+$/, '') : 'Untitled';
        return {
          name: cert.name || nameFromUrl,
          fileUrl: cert.fileUrl || null,
          uploadedAt: cert.uploadedAt || new Date(),
        };
      });
    }
    if (req.body.galleryImages !== undefined) {
      parsedGalleryImages = ensureArray(parsedGalleryImages);
    }

    const profileData = {
      user: req.user._id,
      fullName: req.body.fullName || req.user.fullName,
      yearsOfExperience: req.body.yearsOfExperience,
      shortBio: req.body.shortBio,
      categories: parsedCategories,
      serviceTypes: parsedServiceTypes,
    };
    if (parsedServiceAreas) profileData.serviceAreas = parsedServiceAreas;
    if (parsedCertifications) profileData.certifications = parsedCertifications;
    if (parsedGalleryImages) profileData.galleryImages = parsedGalleryImages;

    // Handle directly uploaded files from uploadAny()
    if (req.files && Array.isArray(req.files)) {
      const profileImages = req.files.filter(f => f.fieldname.toLowerCase().includes('profile'));
      const certFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('cert'));
      const galleryFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('gallery'));

      if (profileImages.length > 0) {
        profileData.profileImage = getFileUrl(req, profileImages[0].filename);
      }
      if (certFiles.length > 0) {
        const uploadedCerts = certFiles.map((file) => ({
          name: file.originalname.replace(/\.[^/.]+$/, ''), // strip extension
          fileUrl: getFileUrl(req, file.filename),
          uploadedAt: new Date(),
        }));
        profileData.certifications = profileData.certifications
          ? [...profileData.certifications, ...uploadedCerts]
          : uploadedCerts;
      }
      if (galleryFiles.length > 0) {
        const uploadedGallery = galleryFiles.map((file) => getFileUrl(req, file.filename));
        profileData.galleryImages = profileData.galleryImages
          ? [...profileData.galleryImages, ...uploadedGallery]
          : uploadedGallery;
      }
    } else if (req.file) {
      // Fallback if somehow using uploadSingle
      profileData.profileImage = getFileUrl(req, req.file.filename);
    }
    
    if (!profileData.profileImage && !profileData.fullName) {
      return sendError(res, 400, 'Profile image or full name is required.');
    }

    const profile = await TrainerProfile.create(profileData);
    profile.profileCompletionPercent = profile.calculateCompletion();
    await profile.save();

    return sendSuccess(res, 201, 'Trainer profile created successfully.', { profile });

  } catch (error) {
    console.error(error, 'error')
    return sendError(res, 400, 'Trainer profile not created.');
  }
});

/**
 * GET /api/trainers/:id
 */
const getTrainerById = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id }).populate('user', 'fullName phoneNumber profileImage role');
  if (!profile) {
    return sendError(res, 404, 'Trainer profile not found.');
  }
  return sendSuccess(res, 200, 'Trainer profile fetched successfully.', { profile });
});

/**
 * PUT /api/trainers/:id
 * Update trainer profile by user ID
 */
const updateTrainerProfile = asyncWrapper(async (req, res) => {
  try {
    const profile = await TrainerProfile.findOne({ user: req.user.id });
    if (!profile) {
      return sendError(res, 404, 'Trainer profile not found.');
    }
    if (profile.user.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'You are not authorized to update this profile.');
    }

    const allowedFields = ['fullName', 'yearsOfExperience', 'shortBio', 'categories', 'serviceTypes', 'serviceAreas', 'certifications', 'galleryImages'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'categories' || field === 'serviceTypes') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed);
          profile[field] = parsed;
        } else if (field === 'serviceAreas') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed).map(area => ({
            ...area,
            location: {
              type: 'Point',
              coordinates: [parseFloat(area.lng) || 0, parseFloat(area.lat) || 0]
            }
          }));
          profile[field] = parsed;
        } else if (field === 'certifications') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed).map(cert => {
            const nameFromUrl = cert.fileUrl ? cert.fileUrl.split('/').pop().replace(/\.[^/.]+$/, '') : 'Untitled';
            return {
              name: cert.name || nameFromUrl,
              fileUrl: cert.fileUrl || null,
              uploadedAt: cert.uploadedAt || new Date(),
            };
          });
          profile[field] = parsed;
        } else if (field === 'galleryImages') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed);
          profile[field] = parsed;
        } else {
          profile[field] = req.body[field];
        }
      }
    });

    // Handle directly uploaded files from uploadAny()
    if (req.files && Array.isArray(req.files)) {
      const profileImages = req.files.filter(f => f.fieldname.toLowerCase().includes('profile'));
      const certFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('cert'));
      const galleryFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('gallery'));

      if (profileImages.length > 0) {
        profile.profileImage = getFileUrl(req, profileImages[0].filename);
      }
      if (certFiles.length > 0) {
        const uploadedCerts = certFiles.map((file) => ({
          name: file.originalname.replace(/\.[^/.]+$/, ''), // strip extension
          fileUrl: getFileUrl(req, file.filename),
          uploadedAt: new Date(),
        }));
        profile.certifications = profile.certifications.concat(uploadedCerts);
      }
      if (galleryFiles.length > 0) {
        const uploadedGallery = galleryFiles.map((file) => getFileUrl(req, file.filename));
        profile.galleryImages = profile.galleryImages.concat(uploadedGallery);
      }
    } else if (req.file) {
      profile.profileImage = getFileUrl(req, req.file.filename);
    }

    profile.profileCompletionPercent = profile.calculateCompletion();
    await profile.save();

    return sendSuccess(res, 200, 'Trainer profile updated successfully.', { profile });
  } catch (error) {
    console.log(error, "error")
    return sendError(res, 400, 'Trainer profile not updated.');
  }
});

/**
 * DELETE /api/trainers/:id
 * Delete trainer profile by user ID
 */
const deleteTrainerProfile = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
  console.log(req.query)

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
 * Upload a certification file (by user ID)
 */
const addCertification = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');
  if (profile.user.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const { name } = req.body;
  if (!req.file) return sendError(res, 400, 'Certification file is required.');

  const certName = name || req.file.originalname.replace(/\.[^/.]+$/, ''); // strip extension
  const certification = { name: certName, uploadedAt: new Date() };
  certification.fileUrl = getFileUrl(req, req.file.filename);

  profile.certifications.push(certification);
  profile.profileCompletionPercent = profile.calculateCompletion();
  await profile.save();

  return sendSuccess(res, 201, 'Certification added successfully.', {
    certification: profile.certifications[profile.certifications.length - 1],
  });
});

/**
 * DELETE /api/trainers/:id/certifications/:certId
 * Delete certification (by user ID)
 */
const deleteCertification = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Add service area (by user ID)
 */
const addServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Update service area (by user ID)
 */
const updateServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Delete service area (by user ID)
 */
const deleteServiceArea = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Upload gallery images (multiple, by user ID)
 */
const addGalleryImages = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Delete gallery image (by user ID)
 */
const deleteGalleryImage = asyncWrapper(async (req, res) => {
  const profile = await TrainerProfile.findOne({ user: req.params.id });
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
 * Find trainer profile by user ID (frontend will send user ID)
 */
const getTrainerDashboard = asyncWrapper(async (req, res) => {
  const Service = require('../models/Service');

  const profile = await TrainerProfile.findOne({ user: req.params.id })
    .populate('user', 'fullName phoneNumber profileImage');

  if (!profile) return sendError(res, 404, 'Trainer profile not found.');

  // Count services offered by this trainer
  const servicesCount = await Service.countDocuments({ trainer: profile._id });

  return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
    // Profile Status
    profileStatus: {
      completionPercent: profile.profileCompletionPercent,
      isComplete: profile.profileCompletionPercent === 100,
    },

    // Basic Info
    trainerInfo: {
      name: profile.fullName || profile.user.fullName,
      profileImage: profile.profileImage || profile.user.profileImage,
      yearsOfExperience: profile.yearsOfExperience || 0,
      specialties: profile.categories || [],
      bio: profile.shortBio || '',
    },

    // Counts
    stats: {
      serviceAreasCount: profile.serviceAreas.length,
      servicesOfferedCount: servicesCount,
      certificationsCount: profile.certifications.length,
      galleryImagesCount: profile.galleryImages.length,
    },

    // Service Types
    serviceTypes: profile.serviceTypes.map((service) => ({
      value: service.value,
      type: service.value, // For backwards compatibility
      price: service.price || 0,
      duration: service.duration || 60,
      count: 0, // Can be populated if you track bookings
    })),

    // Service Areas / Venue Locations
    venueLocations: profile.serviceAreas.map((area) => ({
      id: area._id,
      label: area.label || area.city,
      address: `${area.streetAddress || ''} ${area.city || ''}`,
      city: area.city,
      state: area.state,
      pincode: area.pincode,
      coordinates: {
        lat: area.location.coordinates[1],
        lng: area.location.coordinates[0],
      },
    })),

    // Gallery Images
    gallery: profile.galleryImages || [],

    // Certifications
    certifications: profile.certifications.map((cert) => ({
      id: cert._id,
      name: cert.name,
      fileUrl: cert.fileUrl,
      uploadedAt: cert.uploadedAt,
    })),
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
