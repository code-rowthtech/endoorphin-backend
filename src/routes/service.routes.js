const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { createService, listServices, updateService, deleteService } = require('../controllers/service.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// GET /api/services
router.get('/', listServices);

// POST /api/services
router.post(
  '/',
  // protect,
  [body('name').notEmpty().withMessage('Service name is required.')],
  validate,
  createService
);

// PUT /api/services/:id
router.put(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid service ID.'),
    body('name').optional().notEmpty().withMessage('Service name cannot be empty.'),
  ],
  validate,
  updateService
);

// DELETE /api/services/:id
router.delete(
  '/:id',
  protect,
  [param('id').isMongoId().withMessage('Invalid service ID.')],
  validate,
  deleteService
);

module.exports = router;
