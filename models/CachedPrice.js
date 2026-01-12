const mongoose = require('mongoose');

const cachedPriceSchema = new mongoose.Schema({
  prices: {
    ALTIN_alis: Number, ALTIN_satis: Number,
    KULCEALTIN_alis: Number, KULCEALTIN_satis: Number,
    AYAR22_alis: Number, AYAR22_satis: Number,
    CEYREK_YENI_alis: Number, CEYREK_YENI_satis: Number,
    CEYREK_ESKI_alis: Number, CEYREK_ESKI_satis: Number,
    YARIM_YENI_alis: Number, YARIM_YENI_satis: Number,
    YARIM_ESKI_alis: Number, YARIM_ESKI_satis: Number,
    TEK_YENI_alis: Number, TEK_YENI_satis: Number,
    TEK_ESKI_alis: Number, TEK_ESKI_satis: Number,
    ATA_YENI_alis: Number, ATA_YENI_satis: Number,
    USDTRY_alis: Number, USDTRY_satis: Number,
    EURTRY_alis: Number, EURTRY_satis: Number
  },

  fetchedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // ✅ cron için null olabilir
    default: null
  },

  fetchedAt: {
    type: Date,
    default: Date.now
  },

  source: {
    type: String,
    default: 'haremaltin_api'
  },

  lastApiStatus: {
    freeApiWorking: { type: Boolean, default: true },
    paidApiWorking: { type: Boolean, default: true },
    bothApiFailed: { type: Boolean, default: false },
    lastFailTime: Date
  },

  // ✅ Bu kaydı ne zaman silelim? (ör: 2 saat sonra)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 saat
  }
}, { timestamps: true });

cachedPriceSchema.index({ fetchedAt: -1 });

// ✅ TTL: expiresAt zamanı gelince otomatik sil
cachedPriceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CachedPrice', cachedPriceSchema);
