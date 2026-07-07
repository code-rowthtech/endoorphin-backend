/**
 * Send a successful API response.
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Human-readable message
 * @param {*} data - Response payload
 */
const sendSuccess = (res, statusCode = 200, message = 'Success', data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send an error API response.
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Human-readable error message
 * @param {*} error - Error details (optional, hidden in production)
 */
const sendError = (res, statusCode = 500, message = 'An error occurred', error = {}) => {
  const response = {
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : {},
  };
  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess, sendError };
