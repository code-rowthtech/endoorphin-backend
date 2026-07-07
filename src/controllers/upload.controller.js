const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { getFileUrl } = require('../middlewares/upload.middleware');

/**
 * POST /api/upload
 * Generic single or multiple file upload
 */
const uploadFiles = asyncWrapper(async (req, res) => {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return sendError(res, 400, 'No files uploaded.');
  }

  // Single file
  if (req.file) {
    const url = getFileUrl(req, req.file.filename);
    return sendSuccess(res, 201, 'File uploaded successfully.', {
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }

  // Multiple files
  const urls = req.files.map((file) => ({
    url: getFileUrl(req, file.filename),
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
  }));

  return sendSuccess(res, 201, 'Files uploaded successfully.', {
    files: urls,
    count: urls.length,
  });
});

module.exports = { uploadFiles };
