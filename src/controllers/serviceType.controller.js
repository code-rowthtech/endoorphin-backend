const ServiceType = require('../models/ServiceType');
const TrainerProfile = require('../models/TrainerProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * GET /api/service-types
 */
const listServiceTypes = asyncWrapper(async (req, res) => {
  const { trainerId } = req.query;
  const query = {};

  // Always fetch global service types
  query.trainer = null;
  const globalServiceTypes = await ServiceType.find(query).lean();

  let mappedServiceTypes = globalServiceTypes;

  if (trainerId) {
    const profile = await TrainerProfile.findOne({ user: trainerId }).populate('serviceTypes.serviceType');
    if (profile) {
      const populatedServiceTypes = profile.serviceTypes || [];
      const storedStIds = new Set(populatedServiceTypes.map(st => st.serviceType && st.serviceType._id ? st.serviceType._id.toString() : null));
      
      const globalStsWithFlag = globalServiceTypes.map(st => ({
        ...st,
        isStored: storedStIds.has(st._id.toString()),
      }));
      
      const customSts = populatedServiceTypes
        .filter(st => st.serviceType && st.serviceType.isCustom)
        .map(st => ({
          ...(st.serviceType._doc || st.serviceType),
          isStored: true,
          price: st.price,
          duration: st.duration,
        }));
        
      const mappedGlobalSts = globalStsWithFlag.map(st => {
        if (st.isStored) {
          const storedItem = populatedServiceTypes.find(s => s.serviceType && s.serviceType._id.toString() === st._id.toString());
          if (storedItem) {
            return { ...st, price: storedItem.price, duration: storedItem.duration };
          }
        }
        return st;
      });

      mappedServiceTypes = [...mappedGlobalSts, ...customSts];
    }
  }

  return sendSuccess(res, 200, 'Service types fetched successfully.', { serviceTypes: mappedServiceTypes });
});

/**
 * POST /api/service-types
 * Admin creates global service type
 */
const createGlobalServiceType = asyncWrapper(async (req, res) => {
  const { name, description } = req.body;
  if (!name) return sendError(res, 400, 'Service type name is required.');

  const serviceType = await ServiceType.create({ 
    name, 
    description,
    isCustom: false,
    trainer: null,
  });
  return sendSuccess(res, 201, 'Global service type created successfully.', { serviceType });
});

/**
 * POST /api/trainers/:id/service-types
 * Trainer creates a custom service type
 */
const createCustomServiceType = asyncWrapper(async (req, res) => {
  const { id: trainerId } = req.params;
  const { name, description } = req.body;

  if (!name) return sendError(res, 400, 'Service type name is required.');

  const profile = await TrainerProfile.findOne({ user: trainerId });
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');

  // Optional auth check if needed:
  // if (profile.user.toString() !== req.user._id.toString()) return sendError(res, 403, 'Unauthorized.');

  const serviceType = await ServiceType.create({
    name,
    description,
    trainer: profile._id,
    isCustom: true,
  });

  await TrainerProfile.findByIdAndUpdate(profile._id, {
    $addToSet: { serviceTypes: serviceType._id },
  });

  return sendSuccess(res, 201, 'Custom service type created successfully.', { serviceType });
});

/**
 * PUT /api/service-types/:id
 */
const updateServiceType = asyncWrapper(async (req, res) => {
  const { name, description } = req.body;
  const serviceType = await ServiceType.findByIdAndUpdate(
    req.params.id,
    { name, description },
    { new: true, runValidators: true }
  );
  if (!serviceType) return sendError(res, 404, 'Service type not found.');
  return sendSuccess(res, 200, 'Service type updated successfully.', { serviceType });
});

/**
 * DELETE /api/service-types/:id
 */
const deleteServiceType = asyncWrapper(async (req, res) => {
  const serviceType = await ServiceType.findByIdAndDelete(req.params.id);
  if (!serviceType) return sendError(res, 404, 'Service type not found.');

  if (serviceType.trainer) {
    // Remove it from the trainer's serviceTypes array
    await TrainerProfile.findByIdAndUpdate(serviceType.trainer, {
      $pull: { serviceTypes: { serviceType: serviceType._id } },
    });
  }

  return sendSuccess(res, 200, 'Service type deleted successfully.', {});
});

module.exports = { listServiceTypes, createGlobalServiceType, createCustomServiceType, updateServiceType, deleteServiceType };
