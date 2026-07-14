const express = require('express');
// mergeParams allows access to :venueId from parent router
const venueStaffRouter = express.Router({ mergeParams: true });
const staffRouter = express.Router();

const { body, param } = require('express-validator');
const { addStaff, getVenueStaff, updateStaff, deleteStaff } = require('../controllers/staff.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle } = require('../middlewares/upload.middleware');

// POST /api/venues/:venueId/staff
venueStaffRouter.post(
  '/',
  protect,
  restrictTo('venue_owner'),
  // uploadSingle('photo'),
  [
    param('venueId').isMongoId().withMessage('Invalid venue ID.'),
    body('name').notEmpty().withMessage('Staff name is required.'),
    body('role').optional().isIn(['Trainer', 'Coach', 'Manager']).withMessage('Role must be one of: Trainer, Coach, Manager.'),
  ],
  validate,
  addStaff
);

// GET /api/venues/:venueId/staff
venueStaffRouter.get(
  '/',
  [param('venueId').isMongoId().withMessage('Invalid venue ID.')],
  validate,
  getVenueStaff
);

// PUT /api/staff/:id — accepts both multipart (with photo) and JSON
staffRouter.put(
  '/:id',
  protect,
  restrictTo('venue_owner'),
  (req, res, next) => {
    // Only run multer if content-type is multipart
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      return uploadSingle('photo')(req, res, next);
    }
    next();
  },
  [
    param('id').isMongoId().withMessage('Invalid staff ID.'),
    body('role').optional().isIn(['Trainer', 'Coach', 'Manager']).withMessage('Role must be one of: Trainer, Coach, Manager.'),
  ],
  validate,
  updateStaff
);

// DELETE /api/staff/:id
staffRouter.delete(
  '/:id',
  protect,
  restrictTo('venue_owner'),
  [param('id').isMongoId().withMessage('Invalid staff ID.')],
  validate,
  deleteStaff
);

module.exports = { venueStaffRouter, staffRouter };
