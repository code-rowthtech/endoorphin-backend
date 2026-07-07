const express = require('express');
const router = express.Router();
const { uploadFiles } = require('../controllers/upload.controller');
const { protect } = require('../middlewares/auth.middleware');
const { uploadArray, uploadSingle } = require('../middlewares/upload.middleware');
const multer = require('multer');

/**
 * POST /api/upload
 * Generic upload — accepts single 'file' or multiple 'files'
 * Tries array first, then single
 */
router.post('/', protect, (req, res, next) => {
  // Try multi-file upload first
  const multiUpload = uploadArray('files', 10);
  multiUpload(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      // Fallback to single file
      const singleUpload = uploadSingle('file');
      singleUpload(req, res, (err2) => {
        if (err2) return next(err2);
        next();
      });
    } else if (err) {
      return next(err);
    } else {
      next();
    }
  });
}, uploadFiles);

module.exports = router;
