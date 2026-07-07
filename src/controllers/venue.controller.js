const VenueProfile = require('../models/VenueProfile');
const Service = require('../models/Service');
const Amenity = require('../models/Amenity');
const Staff = require('../models/Staff');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');
const { buildGeoNearStage } = require('../utils/distanceCalculator');

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
    streetAddress,
    area,
    city,
    state,
    pincode,
    lng,
    lat,
    serviceNames,   // array of service names (strings)
    amenityNames,   // array of amenity names (strings)
  } = req.body;

  if (!companyName) {
    return sendError(res, 400, 'Company name is required.');
  }

  // Build location
  const location = {
    type: 'Point',
    coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0],
  };

  const venueData = {
    owner: req.user._id,
    companyName,
    phoneNumber,
    email,
    aboutVenue,
    address: { streetAddress, area, city, state, pincode },
    location,
  };

  if (req.file) {
    venueData.logo = getFileUrl(req, req.file.filename);
  }

  const venue = await VenueProfile.create(venueData);

  // Create services if provided
  if (serviceNames && serviceNames.length > 0) {
    const names = Array.isArray(serviceNames) ? serviceNames : [serviceNames];
    const services = await Service.insertMany(
      names.map((name) => ({ name, venue: venue._id }))
    );
    venue.services = services.map((s) => s._id);
  }

  // Create amenities if provided
  if (amenityNames && amenityNames.length > 0) {
    const names = Array.isArray(amenityNames) ? amenityNames : [amenityNames];
    const amenities = await Amenity.insertMany(
      names.map((name) => ({ name, venue: venue._id }))
    );
    venue.amenities = amenities.map((a) => a._id);
  }

  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

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
  return sendSuccess(res, 200, 'Venue fetched successfully.', { venue });
});

/**
 * PUT /api/venues/:id
 */
const updateVenue = asyncWrapper(async (req, res) => {
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
  if (req.body.streetAddress || req.body.area || req.body.city || req.body.state || req.body.pincode) {
    venue.address = {
      streetAddress: req.body.streetAddress || venue.address?.streetAddress,
      area: req.body.area || venue.address?.area,
      city: req.body.city || venue.address?.city,
      state: req.body.state || venue.address?.state,
      pincode: req.body.pincode || venue.address?.pincode,
    };
  }

  // Update location
  if (req.body.lng || req.body.lat) {
    venue.location = {
      type: 'Point',
      coordinates: [
        parseFloat(req.body.lng) || venue.location.coordinates[0],
        parseFloat(req.body.lat) || venue.location.coordinates[1],
      ],
    };
  }

  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  return sendSuccess(res, 200, 'Venue updated successfully.', { venue });
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
    minDistance = 0,
    maxDistance = 50,
    page = 1,
    limit = 10,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

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

    const matchStage = {};
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

    const venues = await VenueProfile.aggregate(pipeline);
    return sendSuccess(res, 200, 'Venues fetched successfully.', {
      venues,
      pagination: { page: pageNum, limit: limitNum, total: venues.length },
    });
  }

  // Non-geo search
  const query = {};
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
    .populate('services', 'name')
    .populate('amenities', 'name icon')
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
};
