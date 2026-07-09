const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Multer disk storage configuration
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

/**
 * File filter — only accept images
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(null, false); // Don't error, just skip invalid files
  }
};

const multerConfig = {
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
};

/**
 * Single file upload middleware with field name flexibility
 * Accepts common variations of field names
 * @param {string} primaryFieldName - Primary form field name
 * @param {string[]} alternateFieldNames - Alternative field names to accept
 */
const uploadSingle = (primaryFieldName, alternateFieldNames = []) => {
  return (req, res, next) => {
    // Define common aliases for single file uploads
    const commonAliases = {
      profileImage: ['profile_image', 'profile', 'image', 'avatar'],
      certFile: ['cert_file', 'certificate', 'cert', 'file'],
      galleryImages: ['gallery_images', 'gallery', 'images'],
    };

    // Build list of acceptable field names
    const acceptableNames = [primaryFieldName, ...alternateFieldNames];
    if (commonAliases[primaryFieldName]) {
      acceptableNames.push(...commonAliases[primaryFieldName]);
    }

    // Create a flexible multer instance that handles any of these field names
    const flexibleUpload = multer({
      storage,
      fileFilter,
      limits: { fileSize: MAX_FILE_SIZE },
    }).single(primaryFieldName);

    // Try parsing with primary field name first
    flexibleUpload(req, res, (err) => {
      if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
        // If primary field fails, try to manually reassign the uploaded file
        if (req.file) {
          // File was uploaded with a different field name, we can proceed
          return next();
        }

        // Create a new upload attempt that accepts any field name
        const anyFieldUpload = (req, res, next) => {
          const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });
          const multiUpload = upload.any();
          
          multiUpload(req, res, (multiErr) => {
            if (multiErr) return next(multiErr);
            
            // If files were uploaded, move the first one to req.file
            if (req.files && req.files.length > 0) {
              req.file = req.files[0];
              req.files = undefined;
            }
            next();
          });
        };

        return anyFieldUpload(req, res, next);
      }

      if (err) return next(err);
      next();
    });
  };
};

/**
 * Multiple files upload middleware with field name flexibility
 * @param {string} primaryFieldName - Primary form field name
 * @param {number} maxCount - Maximum number of files
 * @param {string[]} alternateFieldNames - Alternative field names to accept
 */
const uploadArray = (primaryFieldName, maxCount = 10, alternateFieldNames = []) => {
  return (req, res, next) => {
    const flexibleUpload = multer({
      storage,
      fileFilter,
      limits: { fileSize: MAX_FILE_SIZE },
    }).array(primaryFieldName, maxCount);

    flexibleUpload(req, res, (err) => {
      if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
        // Try accepting any field name
        const anyFieldUpload = multer({
          storage,
          fileFilter,
          limits: { fileSize: MAX_FILE_SIZE },
        }).any();

        return anyFieldUpload(req, res, (multiErr) => {
          if (multiErr) return next(multiErr);

          // Reorganize uploaded files into req.files array
          if (req.files && req.files.length > 0) {
            req.files = req.files;
          }
          next();
        });
      }

      if (err) return next(err);
      next();
    });
  };
};

/**
 * Multiple fields upload middleware
 * @param {Array} fields - Array of { name, maxCount } objects
 */
const uploadFields = (fields) => multer(multerConfig).fields(fields);

/**
 * Get the served URL for an uploaded file
 * @param {Object} req - Express request
 * @param {string} filename - Filename in uploads directory
 * @returns {string} Full URL to access the file
 */
const getFileUrl = (req, filename) => {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/${filename}`;
};

module.exports = { uploadSingle, uploadArray, uploadFields, getFileUrl };
