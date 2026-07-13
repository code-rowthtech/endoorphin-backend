const Staff = require('../models/Staff');
const VenueProfile = require('../models/VenueProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');

const processExpertise = (expertise) => {
  if (expertise === undefined || expertise === null) return expertise;
  if (Array.isArray(expertise)) return expertise.join(', ');
  if (typeof expertise === 'string') {
    try {
      const parsed = JSON.parse(expertise);
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch (e) {
      return expertise;
    }
  }
  return String(expertise);
};

/**
 * POST /api/venues/:venueId/staff
 */
const addStaff = asyncWrapper(async (req, res) => {
  const { venueId } = req.params;
  const venue = await VenueProfile.findById(venueId);
  if (!venue) return sendError(res, 404, 'Venue not found.');
  if (venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  let { name, role, phoneNumber, yearsOfExperience, expertise } = req.body;
  if (!name) return sendError(res, 400, 'Staff name is required.');

  expertise = processExpertise(expertise);

  const staffData = { venue: venueId, name, role, phoneNumber, yearsOfExperience, expertise };
  if (req.file) {
    staffData.photo = getFileUrl(req, req.file.filename);
  }

  const staff = await Staff.create(staffData);

  const updatedVenue = await VenueProfile.findByIdAndUpdate(venueId, {
    $push: { staff: staff._id },
  }, { new: true });
  
  if (updatedVenue) {
    updatedVenue.profileCompletionPercent = updatedVenue.calculateCompletion();
    await updatedVenue.save();
  }

  return sendSuccess(res, 201, 'Staff member added successfully.', { staff });
});

/**
 * GET /api/venues/:venueId/staff
 */
const getVenueStaff = asyncWrapper(async (req, res) => {
  const staff = await Staff.find({ venue: req.params.venueId }).lean();
  return sendSuccess(res, 200, 'Staff fetched successfully.', { staff });
});

/**
 * PUT /api/staff/:id
 */
const updateStaff = asyncWrapper(async (req, res) => {
  const staffMember = await Staff.findById(req.params.id);
  if (!staffMember) return sendError(res, 404, 'Staff member not found.');

  // Verify ownership through venue
  const venue = await VenueProfile.findById(staffMember.venue);
  if (!venue || venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  let { name, role, phoneNumber, yearsOfExperience, expertise } = req.body;
  if (name !== undefined) staffMember.name = name;
  if (role !== undefined) staffMember.role = role;
  if (phoneNumber !== undefined) staffMember.phoneNumber = phoneNumber;
  if (yearsOfExperience !== undefined) staffMember.yearsOfExperience = yearsOfExperience;
  
  expertise = processExpertise(expertise);
  if (expertise !== undefined) staffMember.expertise = expertise;

  if (req.file) {
    staffMember.photo = getFileUrl(req, req.file.filename);
  }

  await staffMember.save();
  return sendSuccess(res, 200, 'Staff member updated successfully.', { staff: staffMember });
});

/**
 * DELETE /api/staff/:id
 */
const deleteStaff = asyncWrapper(async (req, res) => {
  const staffMember = await Staff.findById(req.params.id);
  if (!staffMember) return sendError(res, 404, 'Staff member not found.');

  // Verify ownership through venue
  const venue = await VenueProfile.findById(staffMember.venue);
  if (!venue || venue.owner.toString() !== req.user._id.toString()) {
    return sendError(res, 403, 'Unauthorized.');
  }

  const updatedVenue = await VenueProfile.findByIdAndUpdate(staffMember.venue, {
    $pull: { staff: staffMember._id },
  }, { new: true });

  if (updatedVenue) {
    updatedVenue.profileCompletionPercent = updatedVenue.calculateCompletion();
    await updatedVenue.save();
  }

  await staffMember.deleteOne();
  return sendSuccess(res, 200, 'Staff member deleted successfully.', {});
});

module.exports = { addStaff, getVenueStaff, updateStaff, deleteStaff };
