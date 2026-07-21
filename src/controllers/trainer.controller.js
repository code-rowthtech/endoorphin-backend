const TrainerProfile = require('../models/TrainerProfile');
const Category = require('../models/Category');
const ServiceType = require('../models/ServiceType');
const mongoose = require('mongoose');
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
  console.log(req.body, "req body is ");
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
    let parsedVenues = parseJSONField(req.body.venues);

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
    if (req.body.venues !== undefined) {
      parsedVenues = ensureArray(parsedVenues);
    }

    const profileData = {
      user: req.user._id,
      fullName: req.body.fullName || req.user.fullName,
      yearsOfExperience: req.body.yearsOfExperience,
      shortBio: req.body.shortBio,
    };
    if (parsedServiceAreas) profileData.serviceAreas = parsedServiceAreas;
    if (parsedCertifications) profileData.certifications = parsedCertifications;
    if (parsedGalleryImages) profileData.galleryImages = parsedGalleryImages;
    if (parsedVenues) profileData.venues = parsedVenues;

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

    // Map Categories
    if (parsedCategories && parsedCategories.length > 0) {
      const existingCatIds = [];
      const customCatNames = [];
      for (const cat of parsedCategories) {
        if (typeof cat === 'string' && mongoose.Types.ObjectId.isValid(cat)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat));
        } else if (typeof cat === 'object' && cat !== null && mongoose.Types.ObjectId.isValid(cat._id || cat.id)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat._id || cat.id));
        } else {
          const catName = typeof cat === 'string' ? cat : cat?.name;
          if (catName) {
            const existing = await Category.findOne({ name: { $regex: new RegExp(`^${catName}$`, 'i') }, type: 'trainer' });
            if (existing) {
              existingCatIds.push(existing._id);
            } else {
              customCatNames.push(catName);
            }
          }
        }
      }
      let newCatIds = [];
      if (customCatNames.length > 0) {
        const created = await Category.insertMany(
          customCatNames.map((name) => ({ name, type: 'trainer', trainer: profile._id, isCustom: true }))
        );
        newCatIds = created.map(c => c._id);
      }
      profile.categories = [...existingCatIds, ...newCatIds];
    }

    // Map ServiceTypes
    if (parsedServiceTypes && parsedServiceTypes.length > 0) {
      const existingStIds = [];
      const customStData = [];
      for (const st of parsedServiceTypes) {
        if (typeof st === 'string' && mongoose.Types.ObjectId.isValid(st)) {
          existingStIds.push(new mongoose.Types.ObjectId(st));
        } else if (typeof st === 'object' && st !== null && mongoose.Types.ObjectId.isValid(st._id || st.id || st.serviceType)) {
          existingStIds.push(new mongoose.Types.ObjectId(st._id || st.id || st.serviceType));
        } else {
          const stValue = typeof st === 'string' ? st : (st?.value || st?.name || st?.serviceType);
          if (stValue) {
            const existing = await ServiceType.findOne({ name: { $regex: new RegExp(`^${stValue}$`, 'i') } });
            if (existing) {
              existingStIds.push(existing._id);
            } else {
              const stDesc = typeof st === 'object' && st.description ? st.description : null;
              customStData.push({ name: stValue, description: stDesc });
            }
          }
        }
      }
      let newStIds = [];
      if (customStData.length > 0) {
        const created = await ServiceType.insertMany(
          customStData.map((data) => ({ name: data.name, description: data.description, trainer: profile._id, isCustom: true }))
        );
        newStIds = created.map(c => c._id);
      }
      profile.serviceTypes = [...existingStIds, ...newStIds];
    }

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
  const profile = await TrainerProfile.findOne({ user: req.params.id })
    .populate('user', 'fullName phoneNumber profileImage role')
    .populate('categories')
    .populate('serviceTypes')
    .populate('venues');
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
  console.log(req.body)
  try {
    const profile = await TrainerProfile.findOne({ user: req.user.id });
    if (!profile) {
      return sendError(res, 404, 'Trainer profile not found.');
    }
    if (profile.user.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'You are not authorized to update this profile.');
    }

    const allowedFields = ['fullName', 'yearsOfExperience', 'shortBio', 'categories', 'serviceTypes', 'serviceAreas', 'certifications', 'galleryImages', 'venues'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'categories') {
          // Categories will be handled below to support async operations
        } else if (field === 'serviceTypes') {
          // ServiceTypes will be handled below to support async operations
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
        } else if (field === 'venues') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed);
          profile[field] = parsed;
        } else {
          profile[field] = req.body[field];
        }
      }
    });

    if (req.body.categories !== undefined) {
      let parsedCategories = ensureArray(parseJSONField(req.body.categories));
      const existingCatIds = [];
      const customCatNames = [];
      for (const cat of parsedCategories) {
        if (typeof cat === 'string' && mongoose.Types.ObjectId.isValid(cat)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat));
        } else if (typeof cat === 'object' && cat !== null && mongoose.Types.ObjectId.isValid(cat._id || cat.id)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat._id || cat.id));
        } else {
          const catName = typeof cat === 'string' ? cat : cat?.name;
          if (catName) {
            const existing = await Category.findOne({ name: { $regex: new RegExp(`^${catName}$`, 'i') }, type: 'trainer' });
            if (existing) {
              existingCatIds.push(existing._id);
            } else {
              customCatNames.push(catName);
            }
          }
        }
      }
      // Cleanup old custom categories for this trainer that are no longer selected
      await Category.deleteMany({
        trainer: profile._id,
        isCustom: true,
        _id: { $nin: existingCatIds }
      });

      let newCatIds = [];
      if (customCatNames.length > 0) {
        const created = await Category.insertMany(
          customCatNames.map((name) => ({ name, type: 'trainer', trainer: profile._id, isCustom: true }))
        );
        newCatIds = created.map(c => c._id);
      }
      profile.categories = [...existingCatIds, ...newCatIds];
    }

    if (req.body.serviceTypes !== undefined) {
      let parsedServiceTypes = ensureArray(parseJSONField(req.body.serviceTypes));
      const existingStIds = [];
      const customStData = [];
      for (const st of parsedServiceTypes) {
        if (typeof st === 'string' && mongoose.Types.ObjectId.isValid(st)) {
          existingStIds.push(new mongoose.Types.ObjectId(st));
        } else if (typeof st === 'object' && st !== null && mongoose.Types.ObjectId.isValid(st._id || st.id || st.serviceType)) {
          existingStIds.push(new mongoose.Types.ObjectId(st._id || st.id || st.serviceType));
        } else {
          const stValue = typeof st === 'string' ? st : (st?.value || st?.name || st?.serviceType);
          if (stValue) {
            const existing = await ServiceType.findOne({ name: { $regex: new RegExp(`^${stValue}$`, 'i') } });
            if (existing) {
              existingStIds.push(existing._id);
            } else {
              const stDesc = typeof st === 'object' && st.description ? st.description : null;
              customStData.push({ name: stValue, description: stDesc });
            }
          }
        }
      }
      // Cleanup old custom serviceTypes for this trainer that are no longer selected
      await ServiceType.deleteMany({
        trainer: profile._id,
        isCustom: true,
        _id: { $nin: existingStIds }
      });

      let newStIds = [];
      if (customStData.length > 0) {
        const created = await ServiceType.insertMany(
          customStData.map((data) => ({ name: data.name, description: data.description, trainer: profile._id, isCustom: true }))
        );
        newStIds = created.map(c => c._id);
      }
      profile.serviceTypes = [...existingStIds, ...newStIds];
    }

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
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const matchStage = {};

  if (category) {
    const cats = await Category.find({ name: { $regex: category, $options: 'i' }, type: 'trainer' }).select('_id');
    matchStage.categories = { $in: cats.map(c => c._id) };
  }
  if (serviceType) {
    const sts = await ServiceType.find({ name: { $regex: serviceType, $options: 'i' } }).select('_id');
    matchStage.serviceTypes = { $in: sts.map(s => s._id) };
  }

  if (search) {
    const matchedCats = await Category.find({ name: { $regex: search, $options: 'i' }, type: 'trainer' }).select('_id');
    matchStage.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { shortBio: { $regex: search, $options: 'i' } },
    ];
    if (matchedCats.length > 0) {
      matchStage.$or.push({ categories: { $in: matchedCats.map(c => c._id) } });
    }
  }

  let trainers = [];
  let total = 0;

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

    trainers = await TrainerProfile.aggregate(pipeline);
    trainers = await TrainerProfile.populate(trainers, [
      { path: 'user', select: 'fullName phoneNumber profileImage' },
      { path: 'categories' },
      { path: 'serviceTypes' },
      { path: 'venues' }
    ]);
    // Aggregation total would require a facet, approximating with length for now as before
    total = trainers.length;
  } else {
    // Non-geo search
    total = await TrainerProfile.countDocuments(matchStage);
    trainers = await TrainerProfile.find(matchStage)
      .populate('user', 'fullName phoneNumber profileImage')
      .populate('categories')
      .populate('serviceTypes')
      .populate('venues')
      .skip(skip)
      .limit(limitNum)
      .lean();
  }

  // Map isStored flags
  const globalCategories = await Category.find({ trainer: null, type: 'trainer' }).lean();
  const globalServiceTypes = await ServiceType.find({ trainer: null }).lean();

  const mappedTrainers = trainers.map((trainer) => {
    // Categories
    const populatedCategories = trainer.categories || [];
    const storedCatIds = new Set(populatedCategories.map(c => c._id ? c._id.toString() : c.toString()));
    const globalCatsWithFlag = globalCategories.map(c => ({
      ...c,
      isStored: storedCatIds.has(c._id.toString()),
    }));
    const customCats = populatedCategories
      .filter(c => c.isCustom)
      .map(c => ({ ...(c._doc || c), isStored: true }));

    // Service Types
    const populatedServiceTypes = trainer.serviceTypes || [];
    const storedStIds = new Set(populatedServiceTypes.map(st => st._id ? st._id.toString() : st.toString()));
    const globalStsWithFlag = globalServiceTypes.map(st => ({
      ...st,
      isStored: storedStIds.has(st._id.toString()),
    }));
    const customSts = populatedServiceTypes
      .filter(st => st.isCustom)
      .map(st => ({ ...(st._doc || st), isStored: true }));

    return {
      ...trainer,
      categories: [...globalCatsWithFlag, ...customCats],
      serviceTypes: [...globalStsWithFlag, ...customSts],
    };
  });

  return sendSuccess(res, 200, 'Trainers fetched successfully.', {
    trainers: mappedTrainers,
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
  const User = require('../models/User');

  const profile = await TrainerProfile.findOne({ user: req.params.id })
    .populate('user', 'fullName phoneNumber profileImage')
    .populate('categories')
    .populate('serviceTypes')
    .populate('venues');

  if (!profile) {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found.');

    return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
      profileExists: false,
      profileStatus: {
        completionPercent: 0,
        isComplete: false,
      },
      trainerInfo: {
        name: user.fullName || '',
        profileImage: user.profileImage || null,
        yearsOfExperience: 0,
        specialties: [],
        bio: '',
      },
      stats: {
        serviceAreasCount: 0,
        servicesOfferedCount: 0,
        certificationsCount: 0,
        galleryImagesCount: 0,
      },
      serviceTypes: [],
      venueLocations: [],
      gallery: [],
      certifications: [],
    });
  }

  // Count services offered by this trainer
  const servicesCount = await Service.countDocuments({ trainer: profile._id });

  // Map isStored flags
  const globalCategories = await Category.find({ trainer: null, type: 'trainer' }).lean();
  const globalServiceTypes = await ServiceType.find({ trainer: null }).lean();

  const populatedCategories = profile.categories || [];
  const storedCatIds = new Set(populatedCategories.map(c => c._id ? c._id.toString() : c.toString()));
  const globalCatsWithFlag = globalCategories.map(c => ({
    ...c,
    isStored: storedCatIds.has(c._id.toString()),
  }));
  const customCats = populatedCategories
    .filter(c => c.isCustom)
    .map(c => ({ ...(c._doc || c), isStored: true }));
  const mappedCategories = [...globalCatsWithFlag, ...customCats];

  const populatedServiceTypes = profile.serviceTypes || [];
  const storedStIds = new Set(populatedServiceTypes.map(st => st._id ? st._id.toString() : st.toString()));
  const globalStsWithFlag = globalServiceTypes.map(st => ({
    ...st,
    isStored: storedStIds.has(st._id.toString()),
  }));
  const customSts = populatedServiceTypes
    .filter(st => st.isCustom)
    .map(st => ({ ...(st._doc || st), isStored: true }));
  const mappedServiceTypes = [...globalStsWithFlag, ...customSts];

  return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
    profileExists: true,
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
      specialties: mappedCategories,
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
    serviceTypes: mappedServiceTypes.map((service) => ({
      ...service,
      value: service.name, // For backwards compatibility
      type: service.name, // For backwards compatibility
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
