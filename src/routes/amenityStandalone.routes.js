const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { updateAmenity, deleteAmenity, createGlobalAmenity, getVenueAmenities } = require('../controllers/amenity.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// POST /api/amenities — super admin creates a global amenity (no venueId required)
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Amenity name is required.'),
    body('icon').optional().isString().withMessage('Icon must be a string.'),
  ],
  validate,
  createGlobalAmenity
);

// GET /api/amenities — fetch all amenities (public)
router.get('/', getVenueAmenities);

// PUT /api/amenities/:id
router.put(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid amenity ID.'),
    body('name').optional().notEmpty().withMessage('Amenity name cannot be empty.'),
  ],
  validate,
  updateAmenity
);

// DELETE /api/amenities/:id
router.delete(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid amenity ID.')],
  validate,
  deleteAmenity
);

module.exports = router;
