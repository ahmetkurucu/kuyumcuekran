const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const CachedPrice = require('../models/CachedPrice');
const connectDB = require('../config/db');

// Admin'ler için: Cache'den fiyat al + marj ekle
router.get('/current', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const cachedPrice = await CachedPrice
      .findOne()
      .sort({ fetchedAt: -1 })
      .limit(1);

    if (!cachedPrice) {
      return res.status(404).json({
        success: false,
        message: 'Fiyat cache\'i bulunamadı. Lütfen bekleyin, otomatik çekilecek.'
      });
    }

    const apiStatus = cachedPrice.lastApiStatus || {};

    if (apiStatus.bothApiFailed) {
      const failMinutes = apiStatus.lastFailTime
        ? Math.floor((Date.now() - new Date(apiStatus.lastFailTime)) / 60000)
        : null;

      return res.status(503).json({
        success: false,
        message: '⚠️ TÜM API\'LER ÇALIŞMIYOR!',
        error: 'API bağlantısı kurulamıyor. Fiyat güncellenemedi.',
        apiStatus: {
          freeApi: 'Çalışmıyor ❌',
          paidApi: 'Çalışmıyor ❌',
          lastFailTime: apiStatus.lastFailTime,
          failDuration: failMinutes != null ? `${failMinutes} dakika önce` : null,
          warning: 'VERİ GÜNCELLENMİYOR - İŞLEM YAPMAKTAN KAÇININ!'
        }
      });
    }

    const prices = cachedPrice.prices || {};
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

    const cacheAgeMinutes = Math.floor((Date.now() - cachedPrice.fetchedAt) / 60000);
    const isStale = cacheAgeMinutes > 5;

    res.json({
      success: true,
      data: finalPrices,
      metadata: {
        fetchedAt: cachedPrice.fetchedAt,
        cacheAge: Math.floor((Date.now() - cachedPrice.fetchedAt) / 1000),
        cacheAgeMinutes,
        source: cachedPrice.source,
        isStale,
        apiStatus: {
          freeApi: apiStatus.freeApiWorking ? 'Çalışıyor ✅' : 'Çalışmıyor ❌',
          paidApi: apiStatus.paidApiWorking ? 'Çalışıyor ✅' : 'Çalışmıyor ❌',
          usingPaidApi: cachedPrice.source === 'paid_api'
        },
        warning: isStale ? '⚠️ VERİ 5 DAKİKADAN ESKİ!' : null
      }
    });

  } catch (error) {
    console.error('Fiyat getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Fiyatlar alınırken hata oluştu',
      error: error.message
    });
  }
});

// Marj güncelleme
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const { code, alis_marj, satis_marj } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Ürün kodu gerekli'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    if (!user.marjlar) user.marjlar = {};

    user.marjlar[`${code}_alis_marj`] = parseFloat(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = parseFloat(satis_marj) || 0;

    user.markModified('marjlar');
    await user.save();

    res.json({
      success: true,
      message: 'Marj başarıyla güncellendi',
      marjlar: user.marjlar
    });

  } catch (error) {
    console.error('Marj güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Marj güncellenirken hata oluştu',
      error: error.message
    });
  }
});

// Marjları listele
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    res.json({
      success: true,
      data: user.marjlar || {}
    });

  } catch (error) {
    console.error('Marj listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Marjlar alınamadı',
      error: error.message
    });
  }
});

module.exports = router;
