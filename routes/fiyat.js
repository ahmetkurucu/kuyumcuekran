const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Harici API
const EXTERNAL_API = 'https://canlipiyasalar.haremaltin.com/tmp/altin.json';

// API'den fiyatları çek
async function fetchExternalPrices() {
  try {
    const response = await axios.get(EXTERNAL_API, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (response.data && response.data.data) {
      return response.data.data;
    }
    
    throw new Error('Geçersiz veri formatı');
  } catch (error) {
    console.error('API hatası:', error.message);
    throw error;
  }
}

// Marjları uygula
function applyMarjlar(externalData, marjlar) {
  const result = {};
  
  const products = [
    'ALTIN', 'KULCEALTIN', 'AYAR22',
    'CEYREK_YENI', 'CEYREK_ESKI',
    'YARIM_YENI', 'YARIM_ESKI',
    'TEK_YENI', 'TEK_ESKI',
    'ATA_YENI', 'USDTRY', 'EURTRY'
  ];

  products.forEach(code => {
    if (externalData[code]) {
      const alisMarj = marjlar[`${code}_alis_marj`] || 0;
      const satisMarj = marjlar[`${code}_satis_marj`] || 0;

      const alis = parseFloat(externalData[code].alis) || 0;
      const satis = parseFloat(externalData[code].satis) || 0;

      // ALIŞ: Marj ÇIKARILIR
      result[`${code}_alis`] = alis - alisMarj;
      
      // SATIŞ: Marj EKLENİR
      result[`${code}_satis`] = satis + satisMarj;
      
      result[`${code}_dir`] = externalData[code].dir;
    }
  });

  return result;
}

// Güncel fiyatları getir (kullanıcının marjlarıyla)
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const externalData = await fetchExternalPrices();
    
    const user = await User.findById(req.user.id);
    const marjlar = user?.marjlar || {};
    
    const finalPrices = applyMarjlar(externalData, marjlar);
    
    res.json({
      success: true,
      data: finalPrices,
      user: {
        full_name: user?.full_name || req.user.full_name,
        username: user?.username || req.user.username
      }
    });
  } catch (error) {
    console.error('Fiyat çekme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Fiyatlar alınamadı'
    });
  }
});

// Marj güncelle
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
    user.marjlar.last_update = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Marj güncellendi',
      data: {
        [`${code}_alis_marj`]: user.marjlar[`${code}_alis_marj`],
        [`${code}_satis_marj`]: user.marjlar[`${code}_satis_marj`]
      }
    });
  } catch (error) {
    console.error('Marj güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Marj güncellenemedi'
    });
  }
});

// Marjları listele
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
      message: 'Marjlar alınamadı'
    });
  }
});

module.exports = router;
