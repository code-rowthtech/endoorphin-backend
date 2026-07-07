const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const {
  createVenue,
  addAnotherVenue,
  getVenueById,
  updateVenue,
  deleteVenue,
  listVenues,
  uploadVenueLogo,
  uploadVenueImages,
  deleteVenueImage,
  getVenueDashboard,
} = require('../controllers/venue.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle, uploadArray } = require('../middlewares/upload.middleware');

// GET /api/venues — list/search
router.get('/', listVenues);

// POST /api/venues — register venue (venue_owner only)
router.post(
  '/',
  protect,
  restrictTo('venue_owner'),
  uploadSingle('logo'),
  [
    body('companyName').notEmpty().withMessage('Company name is required.').trim(),
  ],
  validate,
  createVenue
);

// GET /api/venues/:id
router.get('/:id', [param('id').isMongoId().withMessage('Invalid venue ID.')], validate, getVenueById);

// PUT /api/venues/:id
router.put(
  '/:id',
  protect,
  restrictTo('venue_owner'),
  (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) return uploadSingle('logo')(req, res, next);
    next();
  },
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  updateVenue
);

// DELETE /api/venues/:id
router.delete(
  '/:id',
  protect,
  restrictTo('venue_owner'),
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  deleteVenue
);

// POST /api/venues/:id/add-another — multi-venue owner
router.post(
  '/:id/add-another',
  protect,
  restrictTo('venue_owner'),
  uploadSingle('logo'),
  [body('companyName').notEmpty().withMessage('Company name is required.')],
  validate,
  addAnotherVenue
);

// GET /api/venues/:id/dashboard
router.get(
  '/:id/dashboard',
  protect,
  restrictTo('venue_owner'),
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  getVenueDashboard
);

// POST /api/venues/:id/logo — upload logo
router.post(
  '/:id/logo',
  protect,
  restrictTo('venue_owner'),
  uploadSingle('logo'),
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  uploadVenueLogo
);

// POST /api/venues/:id/images — upload venue images (multi, up to 15)
router.post(
  '/:id/images',
  protect,
  restrictTo('venue_owner'),
  uploadArray('venueImages', 15),
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  uploadVenueImages
);

// DELETE /api/venues/:id/images/:imageId
router.delete(
  '/:id/images/:imageId',
  protect,
  restrictTo('venue_owner'),
  [param('id').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  deleteVenueImage
);

module.exports = router;
