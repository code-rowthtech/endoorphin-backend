const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const {
  createTrainerProfile,
  getTrainerById,
  updateTrainerProfile,
  deleteTrainerProfile,
  listTrainers,
  addCertification,
  deleteCertification,
  addServiceArea,
  updateServiceArea,
  deleteServiceArea,
  addGalleryImages,
  deleteGalleryImage,
  getTrainerDashboard,
} = require('../controllers/trainer.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle, uploadArray } = require('../middlewares/upload.middleware');

// GET /api/trainers — list/search
router.get('/', listTrainers);

// POST /api/trainers — create profile (trainer only)
router.post(
  '/',
  protect,
  restrictTo('trainer'),
  uploadSingle('profileImage'),
  [
    body('fullName').optional().notEmpty().withMessage('Full name cannot be empty.').trim(),
    body('yearsOfExperience').optional().isNumeric().withMessage('Years of experience must be a number.'),
    body('serviceTypes')
      .optional()
      .isArray().withMessage('Service types must be an array.')
      .custom((arr) => {
        const valid = ['In-Person', 'Home Visit', 'Gym Facility'];
        return arr.every((t) => valid.includes(t));
      }).withMessage('Service types must be one of: In-Person, Home Visit, Gym Facility.'),
  ],
  validate,
  createTrainerProfile
);

// GET /api/trainers/:id
router.get('/:id', [param('id').isMongoId().withMessage('Invalid trainer ID.')], validate, getTrainerById);

// PUT /api/trainers/:id
router.put(
  '/:id',
  protect,
  restrictTo('trainer'),
  (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) return uploadSingle('profileImage')(req, res, next);
    next();
  },
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  updateTrainerProfile
);

// DELETE /api/trainers/:id
router.delete(
  '/:id',
  protect,
  restrictTo('trainer'),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  deleteTrainerProfile
);

// GET /api/trainers/:id/dashboard
router.get(
  '/:id/dashboard',
  protect,
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  getTrainerDashboard
);

// POST /api/trainers/:id/certifications — upload cert file
router.post(
  '/:id/certifications',
  protect,
  restrictTo('trainer'),
  uploadSingle('certFile'),
  [
    param('id').isMongoId().withMessage('Invalid trainer ID.'),
    body('name').notEmpty().withMessage('Certification name is required.'),
  ],
  validate,
  addCertification
);

// DELETE /api/trainers/:id/certifications/:certId
router.delete(
  '/:id/certifications/:certId',
  protect,
  restrictTo('trainer'),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  deleteCertification
);

// POST /api/trainers/:id/service-areas
router.post(
  '/:id/service-areas',
  protect,
  restrictTo('trainer'),
  [
    param('id').isMongoId().withMessage('Invalid trainer ID.'),
    body('city').notEmpty().withMessage('City is required.'),
  ],
  validate,
  addServiceArea
);

// PUT /api/trainers/:id/service-areas/:areaId
router.put(
  '/:id/service-areas/:areaId',
  protect,
  restrictTo('trainer'),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  updateServiceArea
);

// DELETE /api/trainers/:id/service-areas/:areaId
router.delete(
  '/:id/service-areas/:areaId',
  protect,
  restrictTo('trainer'),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  deleteServiceArea
);

// POST /api/trainers/:id/gallery — upload gallery images (multiple)
router.post(
  '/:id/gallery',
  protect,
  restrictTo('trainer'),
  uploadArray('galleryImages', 10),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  addGalleryImages
);

// DELETE /api/trainers/:id/gallery/:imageId
router.delete(
  '/:id/gallery/:imageId',
  protect,
  restrictTo('trainer'),
  [param('id').isMongoId().withMessage('Invalid trainer ID.')],
  validate,
  deleteGalleryImage
);

module.exports = router;
