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
const { uploadAny, uploadSingle, uploadArray } = require('../middlewares/upload.middleware');

// GET /api/trainers — list/search
router.get('/', listTrainers);

// POST /api/trainers — create profile (trainer only)
router.post(
  '/',
  protect,
  restrictTo('trainer'),
  uploadAny(),
  [
    body('fullName').optional().notEmpty().withMessage('Full name cannot be empty.').trim(),
    body('yearsOfExperience').optional().isNumeric().withMessage('Years of experience must be a number.'),
  ],
  validate,
  createTrainerProfile
);

// GET /api/trainers/:id
router.get('/:id', validate, getTrainerById);

// PUT /api/trainers/:id
router.put(
  '/',
  protect,
  restrictTo('trainer'),
  (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      return uploadAny()(req, res, next);
    }
    next();
  },
  updateTrainerProfile
);

// DELETE /api/trainers/:id
router.delete(
  '/:id',
  protect,
  restrictTo('trainer'),
  deleteTrainerProfile
);

// GET /api/trainers/:id/dashboard
router.get(
  '/:id/dashboard',
  protect,
  getTrainerDashboard
);

// POST /api/trainers/:id/certifications — upload cert file
router.post(
  '/:id/certifications',
  protect,
  restrictTo('trainer'),
  uploadSingle('certFile'),
  addCertification
);

// DELETE /api/trainers/:id/certifications/:certId
router.delete(
  '/:id/certifications/:certId',
  protect,
  restrictTo('trainer'),
  deleteCertification
);

// POST /api/trainers/:id/service-areas
router.post(
  '/:id/service-areas',
  protect,
  restrictTo('trainer'),
  [
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
  updateServiceArea
);

// DELETE /api/trainers/:id/service-areas/:areaId
router.delete(
  '/:id/service-areas/:areaId',
  protect,
  restrictTo('trainer'),
  deleteServiceArea
);

// POST /api/trainers/:id/gallery — upload gallery images (multiple)
router.post(
  '/:id/gallery',
  protect,
  restrictTo('trainer'),
  uploadArray('galleryImages', 10),
  addGalleryImages
);

// DELETE /api/trainers/:id/gallery/:imageId
router.delete(
  '/:id/gallery/:imageId',
  protect,
  restrictTo('trainer'),
  deleteGalleryImage
);

module.exports = router;
