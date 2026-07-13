const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { listCategories, createGlobalCategory, updateCategory, deleteCategory } = require('../controllers/category.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

// GET /api/categories?type=trainer|venue
router.get('/', listCategories);

// POST /api/categories
router.post(
  '/',
  // protect,
  [
    body('name').notEmpty().withMessage('Category name is required.'),
    body('type')
      .notEmpty().withMessage('Category type is required.')
      .isIn(['trainer', 'venue']).withMessage("Category type must be 'trainer' or 'venue'."),
  ],
  validate,
  createGlobalCategory
);

// PUT /api/categories/:id
router.put('/:id', protect, updateCategory);

// DELETE /api/categories/:id
router.delete('/:id', protect, deleteCategory);

module.exports = router;
