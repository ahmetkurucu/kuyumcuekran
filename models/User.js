const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  full_name: { 
    type: String, 
    required: true 
  },
  role: {
    type: String,
    enum: ['admin', 'superadmin'],
    default: 'admin'
  },
  marjlar: {
    // Gram Altın
    KULCEALTIN_alis_marj: { type: Number, default: 0 },
    KULCEALTIN_satis_marj: { type: Number, default: 0 },
    
    // 22 Ayar
    AYAR22_alis_marj: { type: Number, default: 0 },
    AYAR22_satis_marj: { type: Number, default: 0 },
    
    // Çeyrek
    CEYREK_YENI_alis_marj: { type: Number, default: 0 },
    CEYREK_YENI_satis_marj: { type: Number, default: 0 },
    CEYREK_ESKI_alis_marj: { type: Number, default: 0 },
    CEYREK_ESKI_satis_marj: { type: Number, default: 0 },
    
    // Yarım
    YARIM_YENI_alis_marj: { type: Number, default: 0 },
    YARIM_YENI_satis_marj: { type: Number, default: 0 },
    YARIM_ESKI_alis_marj: { type: Number, default: 0 },
    YARIM_ESKI_satis_marj: { type: Number, default: 0 },
    
    // Tam
    TEK_YENI_alis_marj: { type: Number, default: 0 },
    TEK_YENI_satis_marj: { type: Number, default: 0 },
    TEK_ESKI_alis_marj: { type: Number, default: 0 },
    TEK_ESKI_satis_marj: { type: Number, default: 0 },
    
    // Ata
    ATA_YENI_alis_marj: { type: Number, default: 0 },
    ATA_YENI_satis_marj: { type: Number, default: 0 },
    
    // Döviz
    USDTRY_alis_marj: { type: Number, default: 0 },
    USDTRY_satis_marj: { type: Number, default: 0 },
    EURTRY_alis_marj: { type: Number, default: 0 },
    EURTRY_satis_marj: { type: Number, default: 0 },
    
    last_update: { type: Date, default: Date.now }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('User', userSchema);