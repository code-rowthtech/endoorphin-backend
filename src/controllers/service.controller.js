const Service = require('../models/Service');
const VenueProfile = require('../models/VenueProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * POST /api/services
 */
const createService = asyncWrapper(async (req, res) => {
  const { name, description } = req.body;

  if (!name) return sendError(res, 400, 'Service name is required.');

  // Create as a global service (no venue or trainer)
  const service = await Service.create({
    name,
    description,
    venue: null,
    trainer: null,
    isCustom: false,
  });

  return sendSuccess(res, 201, 'Global service created successfully.', { service });
});

/**
 * GET /api/services
 */
const listServices = asyncWrapper(async (req, res) => {
  const { venueId, trainerId } = req.query;
  const query = {};
  if (venueId) {
    query.venue = venueId;
  } else if (trainerId) {
    query.trainer = trainerId;
  } else {
    // If no specific venue or trainer is requested, fetch ONLY global services
    query.venue = null;
    query.trainer = null;
  }

  const services = await Service.find(query).lean();
  return sendSuccess(res, 200, 'Services fetched successfully.', { services });
});

/**
 * PUT /api/services/:id
 */
const updateService = asyncWrapper(async (req, res) => {
  const { name, description } = req.body;
  const service = await Service.findByIdAndUpdate(
    req.params.id,
    { name, description },
    { new: true, runValidators: true }
  );
  if (!service) return sendError(res, 404, 'Service not found.');
  return sendSuccess(res, 200, 'Service updated successfully.', { service });
});

/**
 * DELETE /api/services/:id
 */
const deleteService = asyncWrapper(async (req, res) => {
  const service = await Service.findByIdAndDelete(req.params.id);
  if (!service) return sendError(res, 404, 'Service not found.');

  // Remove from venue if linked
  if (service.venue) {
    await VenueProfile.findByIdAndUpdate(service.venue, {
      $pull: { services: service._id },
    });
  }

  return sendSuccess(res, 200, 'Service deleted successfully.', {});
});

module.exports = { createService, listServices, updateService, deleteService };
