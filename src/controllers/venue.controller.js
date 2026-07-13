const mongoose = require('mongoose');
const VenueProfile = require('../models/VenueProfile');
const User = require('../models/User');
const Service = require('../models/Service');
const Amenity = require('../models/Amenity');
const Staff = require('../models/Staff');
const Favorite = require('../models/Favorite');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');
const { buildGeoNearStage } = require('../utils/distanceCalculator');

const parseJSONField = (field) => {
  if (!field) return field;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (e) {
      return field;
    }
  }
  return field;
};

const ensureArray = (value) => {
  if (value === undefined || value === null) return value;
  return Array.isArray(value) ? value : [value];
};

/**
 * POST /api/venues
 * Register a venue — full multi-step payload in one call
 */
const createVenue = asyncWrapper(async (req, res) => {
  const {
    companyName,
    phoneNumber,
    email,
    aboutVenue,
    address,        // flutter fallback
    streetAddress,
    area,
    city,
    state,
    pincode,
    lng,
    lat,
    coordinates,    // flutter array fallback
    serviceNames,
    amenityNames,
    services,       // flutter fallback
    amenities,      // flutter fallback
  } = req.body;

  if (!companyName) {
    return sendError(res, 400, 'Company name is required.');
  }

  let finalLng = parseFloat(lng) || 0;
  let finalLat = parseFloat(lat) || 0;

  // Handle coordinates array from flutter
  if (coordinates) {
    let parsedCoords = parseJSONField(coordinates);
    if (Array.isArray(parsedCoords) && parsedCoords.length >= 2) {
      finalLng = parseFloat(parsedCoords[0]) || finalLng;
      finalLat = parseFloat(parsedCoords[1]) || finalLat;
    }
  }

  // Build location
  const location = {
    type: 'Point',
    coordinates: [finalLng, finalLat],
  };

  const venueData = {
    owner: req.user._id,
    companyName,
    phoneNumber,
    email,
    aboutVenue,
    address: {
      streetAddress: streetAddress || address,
      area,
      city,
      state,
      pincode
    },
    location,
  };

  // Handle flexible file uploads (uploadAny populates req.files array)
  if (req.files && req.files.length > 0) {
    const logoFile = req.files.find(f => f.fieldname === 'logo') || req.files[0];
    if (logoFile) {
      venueData.logo = getFileUrl(req, logoFile.filename);
    }

    const imageFiles = req.files.filter(f => f.fieldname === 'venueImages' || f.fieldname === 'images' || f !== logoFile);
    if (imageFiles.length > 0) {
      venueData.venueImages = imageFiles.map(f => getFileUrl(req, f.filename));
    }
  } else if (req.file) {
    venueData.logo = getFileUrl(req, req.file.filename);
  }

  const venue = await VenueProfile.create(venueData);

  // Normalize service & amenity arrays
  let finalServiceNames = ensureArray(parseJSONField(serviceNames || services));
  let finalAmenityNames = ensureArray(parseJSONField(amenityNames || amenities));

  // Create services if provided
  if (finalServiceNames && finalServiceNames.length > 0) {
    const servicesDocs = await Service.insertMany(
      finalServiceNames.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return { ...item, venue: venue._id };
        }
        return { name: item, venue: venue._id };
      })
    );
    venue.services = servicesDocs.map((s) => s._id);
  }

  // Create amenities if provided
  if (finalAmenityNames && finalAmenityNames.length > 0) {
    const amenitiesDocs = await Amenity.insertMany(
      finalAmenityNames.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return { ...item, venue: venue._id };
        }
        return { name: item, venue: venue._id };
      })
    );
    venue.amenities = amenitiesDocs.map((a) => a._id);
  }

  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  // Update user's email and phoneNumber if provided
  if (phoneNumber || email) {
    const userUpdate = {};
    if (phoneNumber) userUpdate.phoneNumber = phoneNumber;
    if (email) userUpdate.email = email;
    await User.findByIdAndUpdate(req.user._id, userUpdate);
  }

  return sendSuccess(res, 201, 'Venue registered successfully.', { venue });
});

/**
 * POST /api/venues/:id/add-another
 * Multi-venue owner — add another venue
 */
const addAnotherVenue = asyncWrapper(async (req, res) => {
  // Reuse createVenue logic but override the owner with req.user._id
  req.body.owner = req.user._id;
  return createVenue(req, res);
});

/**
 * GET /api/venues/:id
 */
const getVenueById = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id)
    .populate('owner', 'fullName phoneNumber profileImage')
    .populate('services')
    .populate('amenities')
    .populate('staff');

  if (!venue) return sendError(res, 404, 'Venue not found.');

  // Check if the authenticated user has favorited this venue
  let isFavorite = false;
  let favoriteId = null;
  if (req.user) {
    const existing = await Favorite.findOne({
      user: req.user._id,
      targetType: 'venue',
      targetId: venue._id,
    });
    if (existing) {
      isFavorite = true;
      favoriteId = existing._id;
    }
  }

  return sendSuccess(res, 200, 'Venue fetched successfully.', { venue, isFavorite, favoriteId });
});

/**
 * PUT /api/venues/:id
 */
const updateVenue = asyncWrapper(async (req, res) => {
  try {
    const venue = await VenueProfile.findById(req.params.id);
    if (!venue) return sendError(res, 404, 'Venue not found.');
    if (venue.owner.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'Unauthorized.');
    }

    const allowedFields = ['companyName', 'phoneNumber', 'email', 'aboutVenue'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) venue[field] = req.body[field];
    });

    // Update address
    if (req.body.streetAddress || req.body.address || req.body.area || req.body.city || req.body.state || req.body.pincode) {
      venue.address = {
        streetAddress: req.body.streetAddress || req.body.address || venue.address?.streetAddress,
        area: req.body.area || venue.address?.area,
        city: req.body.city || venue.address?.city,
        state: req.body.state || venue.address?.state,
        pincode: req.body.pincode || venue.address?.pincode,
      };
    }

    // Update location
    let finalLng = venue.location.coordinates[0];
    let finalLat = venue.location.coordinates[1];

    if (req.body.lng !== undefined) finalLng = parseFloat(req.body.lng) || finalLng;
    if (req.body.lat !== undefined) finalLat = parseFloat(req.body.lat) || finalLat;

    if (req.body.coordinates) {
      let parsedCoords = parseJSONField(req.body.coordinates);
      if (Array.isArray(parsedCoords) && parsedCoords.length >= 2) {
        finalLng = parseFloat(parsedCoords[0]) || finalLng;
        finalLat = parseFloat(parsedCoords[1]) || finalLat;
      }
    }

    venue.location = {
      type: 'Point',
      coordinates: [finalLng, finalLat],
    };

    // Update Logo
    if (req.file) {
      venue.logo = getFileUrl(req, req.file.filename);
    }

    // Update Services
    if (req.body.serviceNames !== undefined || req.body.services !== undefined) {
      await Service.deleteMany({ venue: venue._id });
      let finalServiceNames = ensureArray(parseJSONField(req.body.serviceNames || req.body.services));
      if (finalServiceNames && finalServiceNames.length > 0) {
        const servicesDocs = await Service.insertMany(
          finalServiceNames.map((item) => {
            if (typeof item === 'object' && item !== null) {
              return { ...item, venue: venue._id };
            }
            return { name: item, venue: venue._id };
          })
        );
        venue.services = servicesDocs.map((s) => s._id);
      } else {
        venue.services = [];
      }
    }

    // Update Amenities
    if (req.body.amenityNames !== undefined || req.body.amenities !== undefined) {
      await Amenity.deleteMany({ venue: venue._id });
      let finalAmenityNames = ensureArray(parseJSONField(req.body.amenityNames || req.body.amenities));
      if (finalAmenityNames && finalAmenityNames.length > 0) {
        const amenitiesDocs = await Amenity.insertMany(
          finalAmenityNames.map((item) => {
            if (typeof item === 'object' && item !== null) {
              return { ...item, venue: venue._id };
            }
            return { name: item, venue: venue._id };
          })
        );
        venue.amenities = amenitiesDocs.map((a) => a._id);
      } else {
        venue.amenities = [];
      }
    }

    venue.profileCompletionPercent = venue.calculateCompletion();
    await venue.save();

    // Update user's email and phoneNumber if provided
    if (req.body.phone || req.body.email) {
      const userUpdate = {};
      if (req.body.phone) userUpdate.phoneNumber = req.body.phone;
      if (req.body.email) userUpdate.email = req.body.email;
      await User.findByIdAndUpdate(req.user._id, userUpdate);
    }

    return sendSuccess(res, 200, 'Venue updated successfully.', { venue });
  } catch (error) {
    console.error(error, 'error')
  }
});

/**
 * DELETE /api/venues/:id
 */
const deleteVenue = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }
  await venue.deleteOne();
  return sendSuccess(res, 200, 'Venue deleted successfully.', {});
});

/**
 * GET /api/venues
 * List/search venues with filters
 */
const listVenues = asyncWrapper(async (req, res) => {
  const {
    search,
    category,
    lat,
    lng,
    ownerId,
    minDistance = 0,
    maxDistance = 50,
    page = 1,
    limit = 10,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  // Handle category filter by fetching matching service IDs
  let categoryMatch = {};
  if (category) {
    const services = await Service.find({ name: { $regex: category, $options: 'i' } }).select('_id');
    const serviceIds = services.map((s) => s._id);
    categoryMatch = { services: { $in: serviceIds } };
  }

  if (lat && lng) {
    const pipeline = [];

    pipeline.push(
      buildGeoNearStage(
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(maxDistance),
        parseFloat(minDistance),
        'distanceInMeters',
        'location'
      )
    );

    const matchStage = { ...categoryMatch };
    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      matchStage.owner = new mongoose.Types.ObjectId(ownerId);
    } else if (ownerId) {
      matchStage.owner = ownerId; // Let it fail or match nothing if invalid
    }
    if (search) {
      matchStage.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { aboutVenue: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
      ];
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $addFields: {
        distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] },
      },
    });

    pipeline.push({ $skip: skip }, { $limit: limitNum });

    let venues = await VenueProfile.aggregate(pipeline);

    venues = await VenueProfile.populate(venues, [
      { path: 'owner', select: 'fullName phoneNumber' },
      { path: 'services' },
      { path: 'amenities' }
    ]);

    return sendSuccess(res, 200, 'Venues fetched successfully.', {
      venues,
      pagination: { page: pageNum, limit: limitNum, total: venues.length },
    });
  }

  // Non-geo search
  const query = { ...categoryMatch };
  if (ownerId) query.owner = ownerId;
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { aboutVenue: { $regex: search, $options: 'i' } },
      { 'address.city': { $regex: search, $options: 'i' } },
    ];
  }

  const total = await VenueProfile.countDocuments(query);
  const venues = await VenueProfile.find(query)
    .populate('owner', 'fullName phoneNumber')
    .populate('services')
    .populate('amenities')
    .skip(skip)
    .limit(limitNum)
    .lean();

  return sendSuccess(res, 200, 'Venues fetched successfully.', {
    venues,
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

/**
 * POST /api/venues/:id/logo
 */
const uploadVenueLogo = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }
  if (!req.file) return sendError(res, 400, 'No file uploaded.');

  venue.logo = getFileUrl(req, req.file.filename);
  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  return sendSuccess(res, 200, 'Logo uploaded successfully.', { logo: venue.logo });
});

/**
 * POST /api/venues/:id/images
 */
const uploadVenueImages = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }
  if (!req.files || req.files.length === 0) {
    return sendError(res, 400, 'No files uploaded.');
  }

  const remainingSlots = 15 - venue.venueImages.length;
  if (remainingSlots <= 0) {
    return sendError(res, 400, 'Maximum 15 venue images already reached.');
  }

  const newImages = req.files.slice(0, remainingSlots).map((f) => getFileUrl(req, f.filename));
  venue.venueImages.push(...newImages);
  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  return sendSuccess(res, 201, 'Venue images uploaded successfully.', {
    venueImages: venue.venueImages,
    addedCount: newImages.length,
  });
});

/**
 * DELETE /api/venues/:id/images/:imageId
 * imageId = index in venueImages array
 */
const deleteVenueImage = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const imageIndex = parseInt(req.params.imageId, 10);
  if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= venue.venueImages.length) {
    return sendError(res, 404, 'Image not found at the given index.');
  }

  venue.venueImages.splice(imageIndex, 1);
  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  return sendSuccess(res, 200, 'Venue image deleted successfully.', {
    venueImages: venue.venueImages,
  });
});

/**
 * GET /api/venues/:id/dashboard
 */
const getVenueDashboard = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id)
    .populate('services')
    .populate('amenities')
    .populate('staff');

  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  // Count total venues by this owner
  const totalVenues = await VenueProfile.countDocuments({ owner: req.user._id });

  // Active staff count
  const activeTrainersStaffCount = venue.staff ? venue.staff.length : 0;

  return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
    totalVenues,
    activeServicesCount: venue.services ? venue.services.length : 0,
    totalAmenitiesCount: venue.amenities ? venue.amenities.length : 0,
    activeTrainersStaffCount,
    profileCompletionPercent: venue.profileCompletionPercent,
  });
});

/**
 * PUT /api/venues/:id/business-days
 */
const updateBusinessDays = asyncWrapper(async (req, res) => {
  const venue = await VenueProfile.findById(req.params.id);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const { businessDays } = req.body;
  if (!Array.isArray(businessDays)) {
    return sendError(res, 400, 'businessDays must be an array.');
  }

  venue.businessDays = businessDays;
  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  return sendSuccess(res, 200, 'Business days updated successfully.', { businessDays: venue.businessDays });
});

module.exports = {
  createVenue,
  addAnotherVenue,
  getVenueById,
  updateVenue,
  deleteVenue,
  listVenues,
  uploadVenueLogo,
  uploadVenueImages,
  deleteVenueImage,
  getVenueDashboard,
  updateBusinessDays,
};
