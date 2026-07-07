const mongoose = require('mongoose');

/**
 * Centralized error handler middleware.
 * Handles Mongoose validation errors, cast errors, duplicate key errors, JWT errors.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorDetails = {};

  const isDev = process.env.NODE_ENV === 'development';

  // Mongoose Validation Error
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errorDetails = Object.values(err.errors).reduce((acc, error) => {
      acc[error.path] = error.message;
      return acc;
    }, {});
  }

  // Mongoose CastError (invalid ObjectId, etc.)
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errorDetails = { field: err.path, value: err.value };
  }

  // MongoDB Duplicate Key Error
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue ? err.keyValue[field] : '';
    message = `Duplicate value for field '${field}': '${value}'. Please use a different value.`;
    errorDetails = err.keyValue || {};
  }

  // JWT Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your token has expired. Please log in again.';
  }

  // Multer errors
  else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File size exceeds the allowed limit of 10MB.';
  }

  else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected field in file upload.';
  }

  // Log errors in development
  if (isDev) {
    console.error('ERROR:', err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    error: isDev ? (Object.keys(errorDetails).length > 0 ? errorDetails : { stack: err.stack }) : errorDetails,
  });
};

/**
 * 404 Not Found handler — for unmatched routes
 */
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    error: {},
  });
};

module.exports = { errorHandler, notFound };
