const mongoose = require('mongoose');

const translationCacheSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      index: true,
    },
    originalText: {
      type: String,
      required: true,
    },
    targetLanguage: {
      type: String,
      required: true,
      index: true,
    },
    translatedText: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quick lookups
translationCacheSchema.index({ hash: 1, targetLanguage: 1 }, { unique: true });

module.exports = mongoose.model('TranslationCache', translationCacheSchema);
