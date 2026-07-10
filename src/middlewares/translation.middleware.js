const { translateTexts } = require('../services/openai.service');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getSupportedLanguage } = require('../config/supportedLanguages');

// Helper to determine if a string is a translatable text
// Excludes URLs, Emails, ObjectIDs, ISO Dates, Base64, digits, etc.
const isTranslatable = (str) => {
  if (typeof str !== 'string') return false;
  
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

const translationMiddleware = async (req, res, next) => {
  let targetLanguage = 'en';
  const acceptLanguage = req.headers['accept-language'];

  // 1. Check Header First
  if (acceptLanguage && !acceptLanguage.toLowerCase().startsWith('en')) {
    targetLanguage = getSupportedLanguage(acceptLanguage.split(',')[0].trim());
  } 
  // 2. Check Database via Token
  else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Lookup user language preference
        const user = await User.findById(decoded.id).select('preferredLanguage');
        if (user && user.preferredLanguage) {
          targetLanguage = getSupportedLanguage(user.preferredLanguage);
        }
      } catch (e) {
        // Silently ignore token errors here, let auth middleware handle them later
      }
    }
  }

  // If no translation needed, skip
  if (targetLanguage === 'en') {
    return next();
  }

  // Intercept res.json
  const originalJson = res.json;
  
  res.json = async function (body) {
    // We must restore the original json to prevent infinite recursion
    res.json = originalJson;

    try {
      if (body && typeof body === 'object') {
        // Convert to plain object to strip Mongoose internals/getters
        const plainBody = JSON.parse(JSON.stringify(body));
        const translatableStrings = [];
        
        // 1. Recursively find all translatable strings and store their paths
        const extractStrings = (obj, path = []) => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const val = obj[key];
              
              if (typeof val === 'string') {
                if (isTranslatable(val)) {
                  translatableStrings.push({
                    path: [...path, key],
                    text: val,
                  });
                }
              } else if (typeof val === 'object' && val !== null) {
                // Ignore empty arrays or buffers
                if (!Buffer.isBuffer(val)) {
                  extractStrings(val, [...path, key]);
                }
              }
            }
          }
        };

        // Scan the clean object
        extractStrings(plainBody);

        if (translatableStrings.length > 0) {
          const rawTexts = translatableStrings.map(item => item.text);
          const translatedTexts = await translateTexts(rawTexts, targetLanguage);
          
          // 2. Re-inject translated strings back into the response object
          translatableStrings.forEach((item, index) => {
            let current = plainBody;
            for (let i = 0; i < item.path.length - 1; i++) {
              current = current[item.path[i]];
            }
            const finalKey = item.path[item.path.length - 1];
            current[finalKey] = translatedTexts[index];
          });
        }
        
        // Return the fully translated plain object
        return originalJson.call(this, plainBody);
      }
    } catch (error) {
      console.error('Translation Middleware Error:', error);
      // Fallback to original body on error
    }

    // Send the response
    return originalJson.call(this, body);
  };

  next();
};

module.exports = translationMiddleware;
