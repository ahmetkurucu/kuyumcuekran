const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const { getPrices } = require('../services/priceService');

// ✅ 1) GÜNCEL FİYAT: Ücretsiz 15sn, ücretsiz bozulursa ücretli 30sn TTL
router.get('/current', authenticateToken, async (req, res) => {
  try {
    // Kullanıcıyı bul (marjlar için)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const result = await getPrices(); // free->paid fallback + TTL
    const prices = result.data;

    // Marj uygula
    const finalPrices = {};
    Object.keys(prices).forEach(key => {
      const parts = key.split('_');
      const type = parts[parts.length - 1]; // alis / satis
      const marjKey = `${key}_marj`;
      const marj = user.marjlar?.[marjKey] || 0;

      if (type === 'alis') finalPrices[key] = (prices[key] || 0) - marj;
      else if (type === 'satis') finalPrices[key] = (prices[key] || 0) + marj;
      else finalPrices[key] = prices[key];
    });

    return res.json({
      success: true,
      data: finalPrices,
      metadata: {
        source: result.source === 'free' ? 'ÜCRETSİZ API' : 'ÜCRETLİ API (RapidAPI)',
        refreshPolicy: result.source === 'free' ? '15 saniye' : '30 saniye',
        cached: result.cached,
        cacheAgeSeconds: Math.floor(result.cacheAgeMs / 1000),
        ttlSeconds: Math.floor(result.ttlMs / 1000)
      }
    });
  } catch (err) {
    console.error('Fiyat current hatası:', err);
    return res.status(500).json({ success: false, message: 'Fiyat alınamadı', error: err.message });
  }
});


// ✅ 2) MARJLARI GETİR (Admin panel bunu istiyor)
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    return res.json({
      success: true,
      data: user.marjlar || {}
    });
  } catch (err) {
    console.error('Marjlar getirme hatası:', err);
    return res.status(500).json({ success: false, message: 'Marjlar alınamadı', error: err.message });
  }
});


// ✅ 3) MARJ GÜNCELLE (Admin panel bunu kullanıyor)
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    const { code, alis_marj, satis_marj } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Ürün kodu gerekli' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (!user.marjlar) user.marjlar = {};

    user.marjlar[`${code}_alis_marj`] = parseFloat(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = parseFloat(satis_marj) || 0;
    user.marjlar.last_update = new Date();

    user.markModified('marjlar');
    await user.save();

    return res.json({
      success: true,
      message: 'Marj başarıyla güncellendi',
      marjlar: user.marjlar
    });
  } catch (err) {
    console.error('Marj güncelleme hatası:', err);
    return res.status(500).json({ success: false, message: 'Marj güncellenemedi', error: err.message });
  }
});

module.exports = router;
