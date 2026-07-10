const { translateTexts } = require('../services/openai.service');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getSupportedLanguage } = require('../config/supportedLanguages');

const blacklistedKeys = [
  'password',
  'email',
  'phoneNumber',
  'fullName',
  'companyName',
  '_id',
  'token',
  'profileImage',
  'logo',
  'venueImages',
  'galleryImages',
];

const isTranslatable = (str, key) => {
  if (typeof str !== 'string') return false;
  if (blacklistedKeys.includes(key)) return false;

  const s = str.trim();
  if (!s || s.length < 2) return false;
  if (/^[0-9]+$/.test(s)) return false; // purely numbers
  if (/^[a-fA-F0-9]{24}$/.test(s)) return false; // MongoDB ObjectId
  if (/^https?:\/\//i.test(s)) return false; // URL
  if (/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(s)) return false; // Email
  if (!isNaN(Date.parse(s))) return false; // Date string
  if (s === 'true' || s === 'false') return false; // booleans as string

  return true;
};

const inboundTranslationMiddleware = async (req, res, next) => {
  // Only intercept requests with a body that might be modified
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }
  
  if (!req.body || Object.keys(req.body).length === 0) {
    return next();
  }

  let sourceLanguage = 'en';
  const acceptLanguage = req.headers['accept-language'];

  // Determine user's native language
  if (acceptLanguage && !acceptLanguage.toLowerCase().startsWith('en')) {
    sourceLanguage = getSupportedLanguage(acceptLanguage.split(',')[0].trim());
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('preferredLanguage');
        if (user && user.preferredLanguage) {
          sourceLanguage = getSupportedLanguage(user.preferredLanguage);
        }
      } catch (e) {
        // Silently ignore
      }
    }
  }

  // If user is already using English, no need to translate inbound data to English
  if (sourceLanguage === 'en') {
    return next();
  }

  try {
    const plainBody = JSON.parse(JSON.stringify(req.body));
    const translatableStrings = [];

    const extractStrings = (obj, path = []) => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          
          if (typeof val === 'string') {
            if (isTranslatable(val, key)) {
              translatableStrings.push({
                path: [...path, key],
                text: val,
              });
            }
          } else if (typeof val === 'object' && val !== null) {
            if (!Buffer.isBuffer(val)) {
              extractStrings(val, [...path, key]);
            }
          }
        }
      }
    };

    extractStrings(plainBody);

    if (translatableStrings.length > 0) {
      const rawTexts = translatableStrings.map(item => item.text);
      // Translate FROM user's native language TO English
      const translatedTexts = await translateTexts(rawTexts, 'en', true);
      
      // Re-inject translated English strings into req.body
      translatableStrings.forEach((item, index) => {
        let current = req.body;
        for (let i = 0; i < item.path.length - 1; i++) {
          if (!current[item.path[i]]) current[item.path[i]] = {}; // safety
          current = current[item.path[i]];
        }
        const finalKey = item.path[item.path.length - 1];
        current[finalKey] = translatedTexts[index];
      });
    }
  } catch (error) {
    console.error('Inbound Translation Middleware Error:', error);
  }

  next();
};

module.exports = inboundTranslationMiddleware;
