const Amenity = require('../models/Amenity');
const VenueProfile = require('../models/VenueProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * POST /api/venues/:venueId/amenities
 */
const createAmenity = asyncWrapper(async (req, res) => {
  const { venueId } = req.params;
  const { name, icon, isCustom } = req.body;

  const venue = await VenueProfile.findById(venueId);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const amenity = await Amenity.create({
    name,
    icon,
    venue: venueId,
    isCustom: isCustom || false,
  });

  await VenueProfile.findByIdAndUpdate(venueId, {
    $addToSet: { amenities: amenity._id },
  });

  return sendSuccess(res, 201, 'Amenity added successfully.', { amenity });
});

/**
 * GET /api/venues/:venueId/amenities  — filtered by venue
 * GET /api/amenities                  — all amenities (no venueId)
 */
const getVenueAmenities = asyncWrapper(async (req, res) => {
  const { venueId } = req.params;

  const query = venueId ? { venue: venueId } : {};
  const amenities = await Amenity.find(query).lean();

  return sendSuccess(res, 200, 'Amenities fetched successfully.', { amenities });
}); 

/**
 * PUT /api/amenities/:id
 */
const updateAmenity = asyncWrapper(async (req, res) => {
  const { name, icon } = req.body;
  const amenity = await Amenity.findByIdAndUpdate(
    req.params.id,
    { name, icon },
    { new: true, runValidators: true }
  );
  if (!amenity) return sendError(res, 404, 'Amenity not found.');
  return sendSuccess(res, 200, 'Amenity updated successfully.', { amenity });
});

/**
 * DELETE /api/amenities/:id
 */
const deleteAmenity = asyncWrapper(async (req, res) => {
  const amenity = await Amenity.findByIdAndDelete(req.params.id);
  if (!amenity) return sendError(res, 404, 'Amenity not found.');

  await VenueProfile.findByIdAndUpdate(amenity.venue, {
    $pull: { amenities: amenity._id },
  });

  return sendSuccess(res, 200, 'Amenity deleted successfully.', {});
});

/**
 * POST /api/amenities
 * Super admin — create a global (master) amenity without a venue.
 */
const createGlobalAmenity = asyncWrapper(async (req, res) => {
  const { name, icon } = req.body;

  const amenity = await Amenity.create({
    name,
    icon,
    venue: null,
    isCustom: false,
  });

  return sendSuccess(res, 201, 'Global amenity created successfully.', { amenity });
});

module.exports = { createAmenity, createGlobalAmenity, getVenueAmenities, updateAmenity, deleteAmenity };
