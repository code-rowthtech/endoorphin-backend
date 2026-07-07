const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { updateAmenity, deleteAmenity } = require('../controllers/amenity.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

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
