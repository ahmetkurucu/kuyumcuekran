const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const priceService = require('../services/priceService');

// Admin'ler: Güncel fiyat + marj uygula (fiyat DB'den değil, servis)
router.get('/current', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const ctx = {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: 'GET /api/fiyat/current'
    };

    const result = await priceService.getPrices(ctx);
    const prices = result.data;

    // marj uygula
    const finalPrices = {};
    Object.keys(prices).forEach(key => {
      const parts = key.split('_');
      const type = parts[parts.length - 1]; // alis/satis
      const marjKey = `${key}_marj`;
      const marj = user.marjlar?.[marjKey] || 0;

      if (type === 'alis') finalPrices[key] = (prices[key] || 0) - marj;
      else if (type === 'satis') finalPrices[key] = (prices[key] || 0) + marj;
      else finalPrices[key] = prices[key];
    });

    const ageSec = result.status?.cacheAgeMs ? Math.floor(result.status.cacheAgeMs / 1000) : null;

    return res.json({
      success: true,
      data: finalPrices,
      metadata: {
        source: result.source,
        cached: !!result.cached,
        stale: !!result.stale,
        cacheAgeSec: ageSec,
        status: result.status
      }
    });
  } catch (e) {
    console.error('Fiyat getirme hatası:', e);
    return res.status(500).json({ success: false, message: 'Fiyatlar alınamadı', error: e.message });
  }
});

// Marj güncelleme
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const { code, alis_marj, satis_marj } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Ürün kodu gerekli' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    if (!user.marjlar) user.marjlar = {};

    user.marjlar[`${code}_alis_marj`] = parseFloat(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = parseFloat(satis_marj) || 0;
    user.markModified('marjlar');
    await user.save();

    return res.json({ success: true, message: 'Marj güncellendi', marjlar: user.marjlar });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Marj güncellenemedi', error: e.message });
  }
});

// Marjları listele
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    return res.json({ success: true, data: user.marjlar || {} });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Marjlar alınamadı', error: e.message });
  }
});

module.exports = router;
