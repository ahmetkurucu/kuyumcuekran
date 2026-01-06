const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const { getPrices } = require('../services/priceService');

// Bu router Mongo kullanıyor (marj için). Buffering timeout olmasın diye her istekte DB hazırla.
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (e) {
    console.error('❌ DB bağlantı hatası (fiyat):', e.message);
    return res.status(500).json({ success: false, message: 'DB bağlantı hatası' });
  }
});

// /api/fiyat/current -> API fiyatı + Mongo marj
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const result = await getPrices();

    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    const marjlar = user.marjlar || {};
    const raw = result.data;

    const finalPrices = {};
    for (const key of Object.keys(raw)) {
      const parts = key.split('_');
      const type = parts[parts.length - 1]; // alis/satis
      const marjKey = `${key}_marj`;
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
        ttlSeconds: Math.floor(result.ttlMs / 1000)
      }
    });
  } catch (e) {
    console.error('❌ fiyat/current hata:', e);
    return res.status(500).json({ success: false, message: 'Fiyat alınamadı', error: e.message });
  }
});

// marjlar
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    return res.json({ success: true, data: user.marjlar || {} });
  } catch (e) {
    console.error('❌ marjlar hata:', e);
    return res.status(500).json({ success: false, message: 'Marjlar alınamadı', error: e.message });
  }
});

router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    const { code, alis_marj, satis_marj } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Ürün kodu gerekli' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    if (!user.marjlar) user.marjlar = {};
    user.marjlar[`${code}_alis_marj`] = Number(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = Number(satis_marj) || 0;

    user.markModified('marjlar');
    await user.save();

    return res.json({ success: true, message: 'Marj güncellendi', marjlar: user.marjlar });
  } catch (e) {
    console.error('❌ update-marj hata:', e);
    return res.status(500).json({ success: false, message: 'Marj güncellenemedi', error: e.message });
  }
});

module.exports = router;
