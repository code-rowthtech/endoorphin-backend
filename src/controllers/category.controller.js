const Category = require('../models/Category');
const VenueProfile = require('../models/VenueProfile');
const TrainerProfile = require('../models/TrainerProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * GET /api/categories?type=trainer|venue
 */
const listCategories = asyncWrapper(async (req, res) => {
  const { type, venueId, trainerId } = req.query;
  const query = {};
  if (type) {
    if (!['trainer', 'venue'].includes(type)) {
      return sendError(res, 400, "Type must be 'trainer' or 'venue'.");
    }
    query.type = type;
  }

  // Always fetch global categories for the requested type
  query.venue = null;
  query.trainer = null;
  const globalCategories = await Category.find(query).lean();

  let mappedCategories = globalCategories;

  if (trainerId) {
    const profile = await TrainerProfile.findOne({ user: trainerId }).populate('categories');
    if (profile) {
      const populatedCategories = profile.categories || [];
      const storedCatIds = new Set(populatedCategories.map(c => c._id ? c._id.toString() : c.toString()));
      
      const globalCatsWithFlag = globalCategories.map(c => ({
        ...c,
        isStored: storedCatIds.has(c._id.toString()),
      }));
      
      const customCats = populatedCategories
        .filter(c => c.isCustom)
        .map(c => ({ ...(c._doc || c), isStored: true }));
        
      mappedCategories = [...globalCatsWithFlag, ...customCats];
    }
  } else if (venueId) {
    // Venue categories mapping
    // Assuming VenueProfile handles categories if type=venue
    // Wait, venue uses amenities and services right now, not categories.
    // If it does use categories, we'd do the same here. For now, just return globals.
  }

  return sendSuccess(res, 200, 'Categories fetched successfully.', { categories: mappedCategories });
});

/**
 * POST /api/categories
 * Admin creates global category
 */
const createGlobalCategory = asyncWrapper(async (req, res) => {
  const { name, icon, type } = req.body;
  if (!name) return sendError(res, 400, 'Category name is required.');
  if (!type) return sendError(res, 400, 'Category type is required.');

  const category = await Category.create({ 
    name, 
    icon, 
    type, 
    isCustom: false,
    trainer: null,
    venue: null,
  });
  return sendSuccess(res, 201, 'Global category created successfully.', { category });
});

/**
 * POST /api/trainers/:id/categories
 * Trainer creates a custom category
 */
const createCustomCategory = asyncWrapper(async (req, res) => {
  const { id: trainerId } = req.params;
  const { name, icon } = req.body;

  if (!name) return sendError(res, 400, 'Category name is required.');

  const profile = await TrainerProfile.findOne({ user: trainerId });
  if (!profile) return sendError(res, 404, 'Trainer profile not found.');

  const category = await Category.create({
    name,
    icon,
    type: 'trainer',
    trainer: profile._id,
    isCustom: true,
  });

  await TrainerProfile.findByIdAndUpdate(profile._id, {
    $addToSet: { categories: category._id },
  });

  return sendSuccess(res, 201, 'Custom category created successfully.', { category });
});

/**
 * PUT /api/categories/:id
 */
const updateCategory = asyncWrapper(async (req, res) => {
  const { name, icon, type } = req.body;
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { name, icon, type },
    { new: true, runValidators: true }
  );
  if (!category) return sendError(res, 404, 'Category not found.');
  return sendSuccess(res, 200, 'Category updated successfully.', { category });
});

/**
 * DELETE /api/categories/:id
 */
const deleteCategory = asyncWrapper(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return sendError(res, 404, 'Category not found.');

  if (category.trainer) {
    await TrainerProfile.findByIdAndUpdate(category.trainer, {
      $pull: { categories: category._id },
    });
  }
  // If we start storing categories in VenueProfile like this, we'd do the same here.

  return sendSuccess(res, 200, 'Category deleted successfully.', {});
});

module.exports = { listCategories, createGlobalCategory, createCustomCategory, updateCategory, deleteCategory };
