const express = require('express');
const router = express.Router();
const { unifiedSearch, nearbySearch } = require('../controllers/search.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

// GET /api/search
router.get('/', unifiedSearch);

// GET /api/search/nearby
router.get('/nearby', protect, nearbySearch);

module.exports = router;
