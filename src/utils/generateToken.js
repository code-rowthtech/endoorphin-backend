const jwt = require('jsonwebtoken');

/**
 * Generates a JWT token for the given user ID.
 * @param {string} userId - The user's MongoDB ObjectId
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'endoorphin_secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

module.exports = generateToken;
