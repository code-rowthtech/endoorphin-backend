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

const parseImagesField = (field) => {
  if (!field) return [];

  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return parseImagesField(parsed);
    } catch (e) {
      return [field];
    }
  }

  if (Array.isArray(field)) {
    return field.filter(item => typeof item === 'string' && item.trim() !== '');
  }

  if (typeof field === 'object' && field !== null) {
    if (field[''] && typeof field[''] === 'string') {
      try {
        const parsed = JSON.parse(field['']);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // Fall through
      }
    }

    const values = [];
    Object.keys(field).forEach(key => {
      if (key.trim() !== '' && !isNaN(key) && field[key] && typeof field[key] === 'string') {
        values.push(field[key]);
      }
    });
    if (values.length > 0) return values;
  }

  return [];
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
    phone,          // flutter fallback
    about,          // flutter fallback
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
    phoneNumber: phoneNumber || phone,
    email,
    aboutVenue: aboutVenue || about,
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

  // Fallback: Check if there are images in the request body (e.g. from Flutter/frontend sending image URLs directly)
  if (!venueData.venueImages && (req.body.venueImages || req.body.images || req.body.existingImages)) {
    venueData.venueImages = parseImagesField(req.body.venueImages || req.body.images || req.body.existingImages);
  }

  const venue = await VenueProfile.create(venueData);

  // Normalize service & amenity arrays
  let finalServiceNames = ensureArray(parseJSONField(serviceNames || services));
  let finalAmenityNames = ensureArray(parseJSONField(amenityNames || amenities));

  // Create services if provided
  if (finalServiceNames && finalServiceNames.length > 0) {
    const existingServiceIds = [];
    const customServiceItems = [];

    for (const item of finalServiceNames) {
      if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) {
        existingServiceIds.push(new mongoose.Types.ObjectId(item));
      } else if (typeof item === 'object' && item !== null && mongoose.Types.ObjectId.isValid(item._id || item.id)) {
        existingServiceIds.push(new mongoose.Types.ObjectId(item._id || item.id));
      } else {
        const itemName = typeof item === 'string' ? item : item?.name;
        if (itemName) {
          const existing = await Service.findOne({
            name: { $regex: new RegExp(`^${itemName}$`, 'i') },
            isCustom: false
          });
          if (existing) {
            existingServiceIds.push(existing._id);
          } else {
            customServiceItems.push(item);
          }
        }
      }
    }

    let newCustomServiceIds = [];
    if (customServiceItems.length > 0) {
      const created = await Service.insertMany(
        customServiceItems.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return { ...item, venue: venue._id, isCustom: true };
          }
          return { name: item, venue: venue._id, isCustom: true };
        })
      );
      newCustomServiceIds = created.map((s) => s._id);
    }

    venue.services = [...existingServiceIds, ...newCustomServiceIds];
  }

  // Create amenities if provided
  if (finalAmenityNames && finalAmenityNames.length > 0) {
    const existingIds = [];
    const customItems = [];

    for (const item of finalAmenityNames) {
      if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) {
        existingIds.push(new mongoose.Types.ObjectId(item));
      } else if (typeof item === 'object' && item !== null && mongoose.Types.ObjectId.isValid(item._id || item.id)) {
        existingIds.push(new mongoose.Types.ObjectId(item._id || item.id));
      } else {
        const itemName = typeof item === 'string' ? item : item?.name;
        if (itemName) {
          const existing = await Amenity.findOne({
            name: { $regex: new RegExp(`^${itemName}$`, 'i') },
            isCustom: false
          });
          if (existing) {
            existingIds.push(existing._id);
          } else {
            customItems.push(item);
          }
        }
      }
    }

    let newCustomIds = [];
    if (customItems.length > 0) {
      const created = await Amenity.insertMany(
        customItems.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return { ...item, venue: venue._id, isCustom: true };
          }
          return { name: item, venue: venue._id, isCustom: true };
        })
      );
      newCustomIds = created.map((a) => a._id);
    }

    venue.amenities = [...existingIds, ...newCustomIds];
  }

  venue.profileCompletionPercent = venue.calculateCompletion();
  await venue.save();

  // Update user's email and phoneNumber if provided
  // Update user's email and phoneNumber if provided
  const finalPhone = phoneNumber || phone;
  if (finalPhone || email) {
    const userUpdate = {};
    if (finalPhone) userUpdate.phoneNumber = finalPhone;
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
    .populate('staff')
    .lean();

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

  // Amenities
  const globalAmenities = await Amenity.find({ venue: null }).lean();
  const populatedAmenities = venue.amenities || [];
  const storedAmenityIds = new Set(populatedAmenities.map((a) => (a._id ? a._id.toString() : a.toString())));

  const globalAmenitiesWithFlag = globalAmenities.map((amenity) => ({
    ...amenity,
    isStored: storedAmenityIds.has(amenity._id.toString()),
  }));
  const customAmenities = populatedAmenities
    .filter((a) => a.isCustom)
    .map((a) => ({ ...(a._doc || a), isStored: true }));

  // Services
  const globalServices = await Service.find({ venue: null, trainer: null }).lean();
  const populatedServices = venue.services || [];
  const storedServiceIds = new Set(populatedServices.map((s) => (s._id ? s._id.toString() : s.toString())));

  const globalServicesWithFlag = globalServices.map((service) => ({
    ...service,
    isStored: storedServiceIds.has(service._id.toString()),
  }));
  const customServices = populatedServices
    .filter((s) => s.isCustom)
    .map((s) => ({ ...(s._doc || s), isStored: true }));

  const mappedVenue = {
    ...venue,
    amenities: [...globalAmenitiesWithFlag, ...customAmenities],
    services: [...globalServicesWithFlag, ...customServices],
  };

  return sendSuccess(res, 200, 'Venue fetched successfully.', { venue: mappedVenue, isFavorite, favoriteId });
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

    const allowedFields = ['companyName', 'email', 'aboutVenue'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) venue[field] = req.body[field];
    });

    // Accept frontend aliases
    if (req.body.phoneNumber !== undefined) venue.phoneNumber = req.body.phoneNumber;
    else if (req.body.phone !== undefined) venue.phoneNumber = req.body.phone;

    if (req.body.about !== undefined && req.body.aboutVenue === undefined) venue.aboutVenue = req.body.about;

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
    if (req.files && req.files.length > 0) {
      const logoFile = req.files.find(f => f.fieldname === 'logo');
      if (logoFile) {
        venue.logo = getFileUrl(req, logoFile.filename);
      }
    } else if (req.file) {
      venue.logo = getFileUrl(req, req.file.filename);
    }

    // Update Venue Images
    let incomingImages = [];
    if (req.body.venueImages !== undefined || req.body.images !== undefined || req.body.existingImages !== undefined) {
      incomingImages = parseImagesField(req.body.venueImages || req.body.images || req.body.existingImages);
    } else {
      incomingImages = venue.venueImages || [];
    }

    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files
        .filter(f => f.fieldname === 'venueImages' || f.fieldname === 'images')
        .map(f => getFileUrl(req, f.filename));
      if (uploadedImages.length > 0) {
        incomingImages = [...incomingImages, ...uploadedImages];
      }
    }

    if (req.body.venueImages !== undefined || req.body.images !== undefined || req.body.existingImages !== undefined || (req.files && req.files.length > 0)) {
      venue.venueImages = incomingImages.slice(0, 15); // limit to 15 images
    }

    // Update Services
    if (req.body.serviceNames !== undefined || req.body.services !== undefined) {
      let finalServiceNames = ensureArray(parseJSONField(req.body.serviceNames || req.body.services)) || [];

      const existingServiceIds = [];
      const customServiceItems = [];

      for (const item of finalServiceNames) {
        if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) {
          existingServiceIds.push(new mongoose.Types.ObjectId(item));
        } else if (typeof item === 'object' && item !== null && mongoose.Types.ObjectId.isValid(item._id || item.id)) {
          existingServiceIds.push(new mongoose.Types.ObjectId(item._id || item.id));
        } else {
          const itemName = typeof item === 'string' ? item : item?.name;
          if (itemName) {
            const existing = await Service.findOne({
              name: { $regex: new RegExp(`^${itemName}$`, 'i') },
              isCustom: false
            });
            if (existing) {
              existingServiceIds.push(existing._id);
            } else {
              customServiceItems.push(item);
            }
          }
        }
      }

      // Delete old custom services for this venue that are no longer selected
      await Service.deleteMany({ venue: venue._id, isCustom: true });

      // Create new custom services
      let newCustomServiceIds = [];
      if (customServiceItems.length > 0) {
        const created = await Service.insertMany(
          customServiceItems.map((item) => {
            if (typeof item === 'object' && item !== null) {
              return { ...item, venue: venue._id, isCustom: true };
            }
            return { name: item, venue: venue._id, isCustom: true };
          })
        );
        newCustomServiceIds = created.map((s) => s._id);
      }

      venue.services = [...existingServiceIds, ...newCustomServiceIds];
    }

    // Update Amenities
    // Each item can be:
    //   - A valid MongoId string  → existing admin amenity, just link it (no new doc)
    //   - A name string           → custom amenity, create with isCustom:true
    //   - An object { name, icon }→ custom amenity, create with isCustom:true
    if (req.body.amenityNames !== undefined || req.body.amenities !== undefined) {
      let incoming = ensureArray(parseJSONField(req.body.amenityNames || req.body.amenities)) || [];

      const existingIds = [];   // admin amenities selected by ID
      const customItems = [];   // new custom amenities to create

      for (const item of incoming) {
        // Case 1: plain string that is a valid ObjectId → link existing amenity
        if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) {
          existingIds.push(new mongoose.Types.ObjectId(item));

          // Case 2: object with a valid _id → link existing amenity
        } else if (typeof item === 'object' && item !== null && mongoose.Types.ObjectId.isValid(item._id || item.id)) {
          existingIds.push(new mongoose.Types.ObjectId(item._id || item.id));

          // Case 3: object or name string without a valid ID
        } else {
          const itemName = typeof item === 'string' ? item : item?.name;

          // Check if a global/admin amenity with this name already exists
          if (itemName) {
            const existing = await Amenity.findOne({
              name: { $regex: new RegExp(`^${itemName}$`, 'i') },
              isCustom: false
            });
            if (existing) {
              // Found a matching admin amenity — link it, don't create duplicate
              existingIds.push(existing._id);
            } else {
              // Truly new custom amenity
              customItems.push(item);
            }
          }
        }
      }

      // Delete old custom amenities for this venue that are no longer selected
      await Amenity.deleteMany({ venue: venue._id, isCustom: true });

      // Create new custom amenities
      let newCustomIds = [];
      if (customItems.length > 0) {
        const created = await Amenity.insertMany(
          customItems.map((item) => {
            if (typeof item === 'object' && item !== null) {
              return { ...item, venue: venue._id, isCustom: true };
            }
            return { name: item, venue: venue._id, isCustom: true };
          })
        );
        newCustomIds = created.map((a) => a._id);
      }

      // Final amenity list = existing admin IDs + newly created custom IDs
      venue.amenities = [...existingIds, ...newCustomIds];
    }

    venue.profileCompletionPercent = venue.calculateCompletion();
    await venue.save();

    // Sync email and phoneNumber to User model as well
    const syncPhone = req.body.phoneNumber || req.body.phone;
    const syncEmail = req.body.email;
    if (syncPhone || syncEmail) {
      const userUpdate = {};
      if (syncPhone) userUpdate.phoneNumber = syncPhone;
      if (syncEmail) userUpdate.email = syncEmail;
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

    const globalAmenities = await Amenity.find({ venue: null }).lean();
    const globalServices = await Service.find({ venue: null, trainer: null }).lean();

    const mappedVenues = venues.map((venue) => {
      // Amenities
      const populatedAmenities = venue.amenities || [];
      const storedAmenityIds = new Set(
        populatedAmenities.map((a) => (a._id ? a._id.toString() : a.toString()))
      );
      const globalAmenitiesWithFlag = globalAmenities.map((amenity) => ({
        ...amenity,
        isStored: storedAmenityIds.has(amenity._id.toString()),
      }));
      const customAmenities = populatedAmenities
        .filter((a) => a.isCustom)
        .map((a) => ({ ...(a._doc || a), isStored: true }));

      // Services
      const populatedServices = venue.services || [];
      const storedServiceIds = new Set(
        populatedServices.map((s) => (s._id ? s._id.toString() : s.toString()))
      );
      const globalServicesWithFlag = globalServices.map((service) => ({
        ...service,
        isStored: storedServiceIds.has(service._id.toString()),
      }));
      const customServices = populatedServices
        .filter((s) => s.isCustom)
        .map((s) => ({ ...(s._doc || s), isStored: true }));

      return {
        ...venue,
        amenities: [...globalAmenitiesWithFlag, ...customAmenities],
        services: [...globalServicesWithFlag, ...customServices],
      };
    });

    return sendSuccess(res, 200, 'Venues fetched successfully.', {
      venues: mappedVenues,
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

  const globalAmenities = await Amenity.find({ venue: null }).lean();
  const globalServices = await Service.find({ venue: null, trainer: null }).lean();

  const mappedVenues = venues.map((venue) => {
    // Amenities
    const populatedAmenities = venue.amenities || [];
    const storedAmenityIds = new Set(
      populatedAmenities.map((a) => (a._id ? a._id.toString() : a.toString()))
    );
    const globalAmenitiesWithFlag = globalAmenities.map((amenity) => ({
      ...amenity,
      isStored: storedAmenityIds.has(amenity._id.toString()),
    }));
    const customAmenities = populatedAmenities
      .filter((a) => a.isCustom)
      .map((a) => ({ ...(a._doc || a), isStored: true }));

    // Services
    const populatedServices = venue.services || [];
    const storedServiceIds = new Set(
      populatedServices.map((s) => (s._id ? s._id.toString() : s.toString()))
    );
    const globalServicesWithFlag = globalServices.map((service) => ({
      ...service,
      isStored: storedServiceIds.has(service._id.toString()),
    }));
    const customServices = populatedServices
      .filter((s) => s.isCustom)
      .map((s) => ({ ...(s._doc || s), isStored: true }));

    return {
      ...venue,
      amenities: [...globalAmenitiesWithFlag, ...customAmenities],
      services: [...globalServicesWithFlag, ...customServices],
    };
  });

  return sendSuccess(res, 200, 'Venues fetched successfully.', {
    venues: mappedVenues,
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
