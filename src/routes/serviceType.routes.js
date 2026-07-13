const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { listServiceTypes, createGlobalServiceType, updateServiceType, deleteServiceType } = require('../controllers/serviceType.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// GET /api/service-types
router.get('/', listServiceTypes);

// POST /api/service-types
router.post(
  '/',
  // protect,
  [
    body('name').notEmpty().withMessage('Service type name is required.'),
  ],
  validate,
  createGlobalServiceType
);

// PUT /api/service-types/:id
router.put('/:id', protect, updateServiceType);

// DELETE /api/service-types/:id
router.delete('/:id', protect, deleteServiceType);

module.exports = router;
