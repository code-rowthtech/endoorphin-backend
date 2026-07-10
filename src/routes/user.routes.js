const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getUserById, updateUser, deleteUser } = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle } = require('../middlewares/upload.middleware');

// GET /api/users/:id
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  validate,
  protect,
  getUserById
);

// PUT /api/users/:id
router.put(
  '/:id',
  protect,
  uploadSingle('profileImage'),
  [
    param('id').isMongoId().withMessage('Invalid user ID.'),
    body('fullName').optional().notEmpty().withMessage('Full name cannot be empty.').trim(),
  ],
  validate,
  updateUser
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  validate,
  protect,
  deleteUser
);

// PUT /api/users/:id/language
router.put(
  '/:id/language',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid user ID.'),
    body('language').notEmpty().withMessage('Language cannot be empty.').trim(),
  ],
  validate,
  require('../controllers/user.controller').updateLanguage
);

module.exports = router;
