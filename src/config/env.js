require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/endoorphin',
  JWT_SECRET: process.env.JWT_SECRET || 'endoorphin_secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5,
  NODE_ENV: process.env.NODE_ENV || 'development',
  UPLOADS_PATH: process.env.UPLOADS_PATH || 'uploads',
};
