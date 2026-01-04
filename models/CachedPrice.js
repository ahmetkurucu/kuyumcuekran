const mongoose = require('mongoose');

const cachedPriceSchema = new mongoose.Schema({
  // API'den çekilen ham fiyatlar
  prices: {
    ALTIN_alis: Number,
    ALTIN_satis: Number,
    KULCEALTIN_alis: Number,
    KULCEALTIN_satis: Number,
    AYAR22_alis: Number,
    AYAR22_satis: Number,
    CEYREK_YENI_alis: Number,
    CEYREK_YENI_satis: Number,
    CEYREK_ESKI_alis: Number,
    CEYREK_ESKI_satis: Number,
    YARIM_YENI_alis: Number,
    YARIM_YENI_satis: Number,
    YARIM_ESKI_alis: Number,
    YARIM_ESKI_satis: Number,
    TEK_YENI_alis: Number,
    TEK_YENI_satis: Number,
    TEK_ESKI_alis: Number,
    TEK_ESKI_satis: Number,
    ATA_YENI_alis: Number,
    ATA_YENI_satis: Number,
    USDTRY_alis: Number,
    USDTRY_satis: Number,
    EURTRY_alis: Number,
    EURTRY_satis: Number
  },
  
  // Metadata
  fetchedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  
  source: {
    type: String,
    default: 'haremaltin_api'
  },
  
  // Cache süresi
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10000) // 10 saniye
  }
}, {
  timestamps: true
});

// Index: En son fiyatı hızlı bul
cachedPriceSchema.index({ fetchedAt: -1 });

// TTL Index: Eski kayıtları otomatik sil (1 saat sonra)
cachedPriceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('CachedPrice', cachedPriceSchema);