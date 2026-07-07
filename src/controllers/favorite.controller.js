const Favorite = require('../models/Favorite');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');

/**
 * POST /api/favorites
 */
const addFavorite = asyncWrapper(async (req, res) => {
  const { targetType, targetId } = req.body;

  if (!targetType || !targetId) {
    return sendError(res, 400, 'targetType and targetId are required.');
  }

  // Check for duplicate
  const existing = await Favorite.findOne({
    user: req.user._id,
    targetType,
    targetId,
  });

  if (existing) {
    return sendError(res, 409, 'Already added to favorites.');
  }

  const favorite = await Favorite.create({
    user: req.user._id,
    targetType,
    targetId,
  });

  return sendSuccess(res, 201, 'Added to favorites successfully.', { favorite });
});

/**
 * GET /api/favorites
 */
const getFavorites = asyncWrapper(async (req, res) => {
  const favorites = await Favorite.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, 200, 'Favorites fetched successfully.', {
    favorites,
    total: favorites.length,
  });
});

/**
 * DELETE /api/favorites/:id
 */
const removeFavorite = asyncWrapper(async (req, res) => {
  const favorite = await Favorite.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!favorite) {
    return sendError(res, 404, 'Favorite not found.');
  }

  return sendSuccess(res, 200, 'Removed from favorites successfully.', {});
});

module.exports = { addFavorite, getFavorites, removeFavorite };
