const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const CachedPrice = require('../models/CachedPrice');

// Admin'ler için: Cache'den fiyat al + marj ekle
router.get('/current', authenticateToken, async (req, res) => {
  try {
    // Kullanıcıyı bul (marjlar için)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Cache'den en son fiyatı al
    const cachedPrice = await CachedPrice
      .findOne()
      .sort({ fetchedAt: -1 })
      .limit(1);

    if (!cachedPrice) {
      return res.status(404).json({
        success: false,
        message: 'Fiyat cache\'i bulunamadı. Super Admin\'in API\'den çekmesi gerekiyor.',
        hint: 'Super Admin: POST /api/cache/fetch-from-api'
      });
    }

    // Ham fiyatları al
    const prices = cachedPrice.prices;

    // Kullanıcının marjlarını uygula
    const finalPrices = {};

    // Her ürün için marj uygula
    Object.keys(prices).forEach(key => {
      const [productCode, type] = key.split('_');
      const marjKey = `${productCode}_${type}_marj`;
      const marj = user.marjlar?.[marjKey] || 0;

      if (type === 'alis') {
        // Alış: API fiyatından marj ÇIKARILIR
        finalPrices[key] = prices[key] - marj;
      } else if (type === 'satis') {
        // Satış: API fiyatına marj EKLENİR
        finalPrices[key] = prices[key] + marj;
      } else {
        finalPrices[key] = prices[key];
      }
    });

    res.json({
      success: true,
      data: finalPrices,
      metadata: {
        fetchedAt: cachedPrice.fetchedAt,
        cacheAge: Math.floor((Date.now() - cachedPrice.fetchedAt) / 1000),
        source: 'cached'
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

// Marj güncelleme (değişiklik yok)
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
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

    if (!user.marjlar) {
      user.marjlar = {};
    }

    user.marjlar[`${code}_alis_marj`] = parseFloat(alis_marj) || 0;
    user.marjlar[`${code}_satis_marj`] = parseFloat(satis_marj) || 0;

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

// Marjları listele (değişiklik yok)
router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
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
