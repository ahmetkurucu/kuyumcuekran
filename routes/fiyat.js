const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const { getPrices } = require('../services/priceService');

// ✅ Bu router’daki tüm endpointler Mongo kullanıyor (marj okumak/yazmak için)
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (e) {
    console.error('❌ DB bağlantı hatası (fiyat router):', e.message);
    return res.status(500).json({ success: false, message: 'DB bağlantı hatası' });
  }
});

// Admin'ler için: API’den fiyat al + Mongo’daki marjı uygula
router.get('/current', authenticateToken, async (req, res) => {
  try {
    // 1) Fiyatları API’den al (Mongo yok)
    const result = await getPrices();

    // 2) Kullanıcının marjını Mongo’dan oku
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Token kullanıcı id yok' });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const marjlar = user.marjlar || {};
    const raw = result.data;

    // 3) Marj uygula
    const finalPrices = {};
    for (const key of Object.keys(raw)) {
      const parts = key.split('_');
      const type = parts[parts.length - 1]; // alis/satis

      const marjKey = `${key}_marj`; // KULCEALTIN_satis_marj gibi
      const marj = Number(marjlar[marjKey]) || 0;

      if (type === 'alis') finalPrices[key] = (raw[key] || 0) - marj;
      else if (type === 'satis') finalPrices[key] = (raw[key] || 0) + marj;
      else finalPrices[key] = raw[key];
    }

    return res.json({
      success: true,
      data: finalPrices,
      metadata: {
        source: result.source === 'free' ? 'FREE_API' : 'PAID_API',
        refreshPolicy: result.source === 'free' ? '15s' : '30s',
        cached: result.cached,
        cacheAgeSeconds: Math.floor(result.cacheAgeMs / 1000),
        ttlSeconds: Math.floor(result.ttlMs / 1000),
      }
    });
  } catch (error) {
    console.error('Fiyat current hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Fiyatlar alınırken hata oluştu',
      error: error.message
    });
  }
});

// Marj güncelleme (Mongo şart)
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    const { code, alis_marj, satis_marj } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Ürün kodu gerekli' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    if (!user.marjlar) user.marjlar = {};

    user.marjlar[`${code}_alis_marj`] = Number(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = Number(satis_marj) || 0;

    user.markModified('marjlar');
    await user.save();

    return res.json({ success: true, message: 'Marj başarıyla güncellendi', marjlar: user.marjlar });
  } catch (error) {
    console.error('Marj güncelleme hatası:', error);
    return res.status(500).json({ success: false, message: 'Marj güncellenirken hata oluştu', error: error.message });
  }
});

// Marjları listele (Mongo şart)
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    return res.json({ success: true, data: user.marjlar || {} });
  } catch (error) {
    console.error('Marj listeleme hatası:', error);
    return res.status(500).json({ success: false, message: 'Marjlar alınamadı', error: error.message });
  }
});

module.exports = router;
