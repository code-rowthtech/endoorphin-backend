/**
 * List of supported languages in the application.
 * If a user's language is not in this list, default to English ('en').
 */
const SUPPORTED_LANGUAGES = [
  'en', // English
  'ar', // Arabic
  'nl', // Dutch
  'es', // Spanish
  'de', // German
  'it', // Italian
  'fr', // French
  'pl', // Polish
  'el', // Greek
  'sv', // Swedish
  'tr', // Turkish
  'da', // Danish
  'pt', // Portuguese
];

const isSupportedLanguage = (lang) => {
  if (!lang || typeof lang !== 'string') return false;
  return SUPPORTED_LANGUAGES.includes(lang.toLowerCase().split('-')[0]);
};

const getSupportedLanguage = (lang) => {
  if (!lang || typeof lang !== 'string') return 'en';
  const code = lang.toLowerCase().split('-')[0]; // 'en-US' -> 'en'
  return SUPPORTED_LANGUAGES.includes(code) ? code : 'en';
};

module.exports = { SUPPORTED_LANGUAGES, isSupportedLanguage, getSupportedLanguage };
