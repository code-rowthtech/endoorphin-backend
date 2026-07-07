const express = require('express');
const router = express.Router();
const { unifiedSearch, nearbySearch } = require('../controllers/search.controller');

// GET /api/search
router.get('/', unifiedSearch);

// GET /api/search/nearby
router.get('/nearby', nearbySearch);

module.exports = router;
