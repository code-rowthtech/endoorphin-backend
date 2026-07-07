const express = require('express');
const router = express.Router({ mergeParams: true });
const { body, param } = require('express-validator');
const { createAmenity, getVenueAmenities, updateAmenity, deleteAmenity } = require('../controllers/amenity.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// POST /api/venues/:venueId/amenities
router.post(
  '/',
  protect,
  [
    param('venueId').isMongoId().withMessage('Invalid venue ID.'),
    body('name').notEmpty().withMessage('Amenity name is required.'),
  ],
  validate,
  createAmenity
);

// GET /api/venues/:venueId/amenities
router.get(
  '/',
  [param('venueId').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  getVenueAmenities
);

module.exports = router;
