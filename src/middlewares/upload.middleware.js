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
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Only image files are allowed (JPG, JPEG, PNG, GIF). Received: ${file.mimetype}`
      ),
      false
    );
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
 * Single file upload middleware
 * @param {string} fieldName - Form field name
 */
const uploadSingle = (fieldName) => multer(multerConfig).single(fieldName);

/**
 * Multiple files upload middleware
 * @param {string} fieldName - Form field name
 * @param {number} maxCount - Maximum number of files
 */
const uploadArray = (fieldName, maxCount = 10) => multer(multerConfig).array(fieldName, maxCount);

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
