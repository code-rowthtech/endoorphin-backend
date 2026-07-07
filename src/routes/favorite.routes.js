const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { addFavorite, getFavorites, removeFavorite } = require('../controllers/favorite.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// POST /api/favorites
router.post(
  '/',
  protect,
  [
    body('targetType')
      .notEmpty().withMessage('Target type is required.')
      .isIn(['venue', 'trainer']).withMessage("Target type must be 'venue' or 'trainer'."),
    body('targetId').notEmpty().withMessage('Target ID is required.').isMongoId().withMessage('Invalid target ID.'),
  ],
  validate,
  addFavorite
);

// GET /api/favorites
router.get('/', protect, getFavorites);

// DELETE /api/favorites/:id
router.delete(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid favorite ID.')],
  validate,
  removeFavorite
);

module.exports = router;
