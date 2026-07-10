const { OpenAI } = require('openai');
const crypto = require('crypto');
const TranslationCache = require('../models/TranslationCache');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateHash = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Translates an array of strings in a single batch using OpenAI
 * @param {string[]} texts - Array of strings to translate
 * @param {string} targetLanguage - Target language (e.g. 'ar' for Arabic)
 * @returns {string[]} Translated strings in the exact same order
 */
const translateBatchWithOpenAI = async (texts, targetLanguage) => {
  if (!texts || texts.length === 0) return [];

  // We ask OpenAI to return a strict JSON array of translated strings
  const prompt = `Translate the following array of text strings into ${targetLanguage}. Maintain the exact same array structure, order, and length. Only return the JSON array of translated strings. Do not include any markdown formatting like \`\`\`json.
  
Texts: ${JSON.stringify(texts)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // low temp for literal translation
    });

    const output = response.choices[0].message.content.trim();
    // Sometimes the model outputs markdown anyway, let's strip it just in case
    const cleanOutput = output.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    
    const translatedArray = JSON.parse(cleanOutput);

    if (!Array.isArray(translatedArray) || translatedArray.length !== texts.length) {
      console.warn('OpenAI returned invalid array length. Falling back to original texts.');
      return texts;
    }

    return translatedArray;
  } catch (error) {
    console.error('OpenAI Translation Error:', error);
    return texts; // fallback to english
  }
};

/**
 * High level function to translate texts using MongoDB Cache
 */
const translateTexts = async (texts, targetLanguage, forceTranslation = false) => {
  if (!texts || texts.length === 0) return [];
  if (targetLanguage === 'en' && !forceTranslation) return texts; // skip outbound english to english

  const textsWithHash = texts.map((text) => ({
    text,
    hash: generateHash(text),
  }));

  // 1. Check cache for all strings
  const hashes = textsWithHash.map((t) => t.hash);
  const cachedTranslations = await TranslationCache.find({
    hash: { $in: hashes },
    targetLanguage,
  });

  const cacheMap = {};
  cachedTranslations.forEach((doc) => {
    cacheMap[doc.hash] = doc.translatedText;
  });

  // 2. Identify missing translations
  const missingIndexes = [];
  const missingTexts = [];

  textsWithHash.forEach((item, index) => {
    if (!cacheMap[item.hash]) {
      missingIndexes.push(index);
      missingTexts.push(item.text);
    }
  });

  // 3. Batch translate missing texts
  if (missingTexts.length > 0) {
    const translatedMissing = await translateBatchWithOpenAI(missingTexts, targetLanguage);

    // Save to cache
    const newCacheDocs = missingTexts.map((text, i) => ({
      hash: generateHash(text),
      originalText: text,
      targetLanguage,
      translatedText: translatedMissing[i] || text,
    }));

    if (newCacheDocs.length > 0) {
      await TranslationCache.insertMany(newCacheDocs, { ordered: false }).catch((e) => {
        // ignore duplicate key errors if parallel requests occurred
      });
    }

    // Populate cacheMap with new translations
    newCacheDocs.forEach((doc) => {
      cacheMap[doc.hash] = doc.translatedText;
    });
  }

  // 4. Reconstruct final array
  return textsWithHash.map((item) => cacheMap[item.hash] || item.text);
};

module.exports = { translateTexts };
