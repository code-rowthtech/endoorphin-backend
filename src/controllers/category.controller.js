const Category = require('../models/Category');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * GET /api/categories?type=trainer|venue
 */
const listCategories = asyncWrapper(async (req, res) => {
  const { type } = req.query;
  const query = {};
  if (type) {
    if (!['trainer', 'venue'].includes(type)) {
      return sendError(res, 400, "Type must be 'trainer' or 'venue'.");
    }
    query.type = type;
  }
  const categories = await Category.find(query).lean();
  return sendSuccess(res, 200, 'Categories fetched successfully.', { categories });
});

/**
 * POST /api/categories
 */
const createCategory = asyncWrapper(async (req, res) => {
  const { name, icon, type, isCustom } = req.body;
  if (!name) return sendError(res, 400, 'Category name is required.');
  if (!type) return sendError(res, 400, 'Category type is required.');

  const category = await Category.create({ name, icon, type, isCustom: isCustom || true });
  return sendSuccess(res, 201, 'Category created successfully.', { category });
});

module.exports = { listCategories, createCategory };
