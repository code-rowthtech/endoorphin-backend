const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');

/**
 * GET /api/users/:id
 */
const getUserById = asyncWrapper(async (req, res) => {
  const user = await User.findById(req.params.id).select('-__v');
  if (!user) {
    return sendError(res, 404, 'User not found.');
  }
  return sendSuccess(res, 200, 'User fetched successfully.', { user });
});

/**
 * PUT /api/users/:id
 * Update name and/or profile image.
 */
const updateUser = asyncWrapper(async (req, res) => {
  // Only allow the user to update their own profile (or admin — not implemented)
  if (req.user._id.toString() !== req.params.id) {
    return sendError(res, 403, 'You are not authorized to update this user.');
  }

  const updates = {};
  if (req.body.fullName) updates.fullName = req.body.fullName;

  // Handle profile image upload
  if (req.file) {
    updates.profileImage = getFileUrl(req, req.file.filename);
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select('-__v');

  if (!user) {
    return sendError(res, 404, 'User not found.');
  }

  return sendSuccess(res, 200, 'User updated successfully.', { user });
});

/**
 * DELETE /api/users/:id
 * Soft delete — sets isActive to false.
 */
const deleteUser = asyncWrapper(async (req, res) => {
  if (req.user._id.toString() !== req.params.id) {
    return sendError(res, 403, 'You are not authorized to delete this user.');
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!user) {
    return sendError(res, 404, 'User not found.');
  }

  return sendSuccess(res, 200, 'User account deactivated successfully.', {});
});

module.exports = { getUserById, updateUser, deleteUser };
