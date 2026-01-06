const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const connectDB = require('../config/db');

// ===================================
// MEMORY CACHE - MongoDB YOK!
// ===================================
let priceCache = {
  data: null,
  lastFetch: null,
  source: null,
  error: null
};

let fetchInterval = null;
let currentApiType = 'free'; // 'free' veya 'paid'

// API Yapılandırması
const API_CONFIG = {
  FREE: {
    url: 'https://canlipiyasalar.haremaltin.com/tmp/altin.json',
    interval: 15000, // 15 saniye
    timeout: 10000
  },
  PAID: {
    url: 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
    interval: 30000, // 30 saniye
    timeout: 10000,
    headers: {
      'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY
    }
  }
};

/**
 * RapidAPI array formatını parse et
 */
function parseRapidAPIData(dataArray) {
  const result = {};
  
  const keyMapping = {
    'GRAM ALTIN': 'KULCEALTIN',
    '22 AYAR': 'AYAR22',
    'YENİ ÇEYREK': 'CEYREK_YENI',
    'ESKİ ÇEYREK': 'CEYREK_ESKI',
    'YENİ YARIM': 'YARIM_YENI',
    'ESKİ YARIM': 'YARIM_ESKI',
    'YENİ TAM': 'TEK_YENI',
    'ESKİ TAM': 'TEK_ESKI',
    'YENİ ATA': 'ATA_YENI',
    'Has Altın': 'ALTIN'
  };
  
  dataArray.forEach(item => {
    const mappedKey = keyMapping[item.key];
    if (mappedKey) {
      const buyPrice = parseFloat(item.buy.replace(/\./g, '').replace(',', '.')) || 0;
      const sellPrice = parseFloat(item.sell.replace(/\./g, '').replace(',', '.')) || 0;
      result[`${mappedKey}_alis`] = buyPrice;
      result[`${mappedKey}_satis`] = sellPrice;
    }
  });
  
  result.USDTRY_alis = 0;
  result.USDTRY_satis = 0;
  result.EURTRY_alis = 0;
  result.EURTRY_satis = 0;
  
  return result;
}

/**
 * ÜCRETSİZ API'den veri çek
 */
async function fetchFromFreeAPI() {
  try {
    console.log('🔄 Ücretsiz API\'den çekiliyor...');
    
    const response = await axios.get(API_CONFIG.FREE.url, {
      timeout: API_CONFIG.FREE.timeout,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.data || !response.data.data) {
      throw new Error('Geçersiz veri formatı');
    }

    const rawData = response.data.data;
    const normalizedData = {};

    Object.keys(rawData).forEach(key => {
      const item = rawData[key];
      if (item && typeof item === 'object') {
        normalizedData[`${key}_alis`] = parseFloat(item.alis) || 0;
        normalizedData[`${key}_satis`] = parseFloat(item.satis) || 0;
      }
    });

    if (!normalizedData.KULCEALTIN_satis || normalizedData.KULCEALTIN_satis === 0) {
      throw new Error('Ücretsiz API geçersiz veri döndürdü');
    }

    // Memory cache'e kaydet
    priceCache = {
      data: normalizedData,
      lastFetch: new Date(),
      source: 'free_api',
      error: null
    };

    console.log(`✅ Ücretsiz API başarılı - Gram: ₺${normalizedData.KULCEALTIN_satis}`);
    return true;

  } catch (error) {
    console.error('❌ Ücretsiz API hatası:', error.message);
    priceCache.error = error.message;
    return false;
  }
}

/**
 * ÜCRETLİ API'den veri çek
 */
async function fetchFromPaidAPI() {
  try {
    console.log('🔄 Ücretli API\'den çekiliyor...');
    
    const response = await axios.get(API_CONFIG.PAID.url, {
      timeout: API_CONFIG.PAID.timeout,
      headers: API_CONFIG.PAID.headers
    });

    if (!response.data || !response.data.data) {
      throw new Error('Ücretli API veri döndürmedi');
    }

    const normalizedData = parseRapidAPIData(response.data.data);
    
    // TCMB döviz kurları (opsiyonel)
    try {
      const xml2js = require('xml2js');
      const tcmbResponse = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 5000 });
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(tcmbResponse.data);
      const currencies = result.Tarih_Date.Currency;
      
      const usd = currencies.find(c => c.$.CurrencyCode === 'USD');
      if (usd) {
        normalizedData.USDTRY_alis = parseFloat(usd.ForexBuying?.[0]) || 0;
        normalizedData.USDTRY_satis = parseFloat(usd.ForexSelling?.[0]) || 0;
      }
      
      const eur = currencies.find(c => c.$.CurrencyCode === 'EUR');
      if (eur) {
        normalizedData.EURTRY_alis = parseFloat(eur.ForexBuying?.[0]) || 0;
        normalizedData.EURTRY_satis = parseFloat(eur.ForexSelling?.[0]) || 0;
      }
    } catch (tcmbError) {
      console.warn('⚠️  TCMB hatası:', tcmbError.message);
    }

    // Memory cache'e kaydet
    priceCache = {
      data: normalizedData,
      lastFetch: new Date(),
      source: 'paid_api',
      error: null
    };

    console.log(`✅ Ücretli API başarılı - Gram: ₺${normalizedData.KULCEALTIN_satis}`);
    return true;

  } catch (error) {
    console.error('❌ Ücretli API hatası:', error.message);
    priceCache.error = error.message;
    return false;
  }
}

/**
 * Otomatik fetch sistemi başlat
 */
async function startAutoFetch() {
  console.log('\n🚀 OTOMATİK FETCH BAŞLATILDI');
  console.log('==========================================');
  
  // İlk fetch
  const freeSuccess = await fetchFromFreeAPI();
  
  if (freeSuccess) {
    currentApiType = 'free';
    console.log('📋 Mod: ÜCRETSİZ API (15 saniye aralık)');
  } else {
    currentApiType = 'paid';
    await fetchFromPaidAPI();
    console.log('📋 Mod: ÜCRETLİ API (30 saniye aralık)');
  }
  
  // Interval başlat
  scheduleFetch();
  
  // Her 5 dakikada bir API tipini kontrol et
  setInterval(async () => {
    if (currentApiType === 'paid') {
      // Ücretsiz API'yi tekrar test et
      const freeTest = await fetchFromFreeAPI();
      if (freeTest) {
        console.log('✅ Ücretsiz API tekrar çalışıyor - Geçiş yapılıyor');
        currentApiType = 'free';
        scheduleFetch(); // Interval'i yeniden ayarla
      }
    }
  }, 5 * 60 * 1000); // 5 dakika
}

/**
 * Fetch'i zamanla
 */
function scheduleFetch() {
  // Eski interval'i temizle
  if (fetchInterval) {
    clearInterval(fetchInterval);
  }
  
  const interval = API_CONFIG[currentApiType === 'free' ? 'FREE' : 'PAID'].interval;
  
  fetchInterval = setInterval(async () => {
    if (currentApiType === 'free') {
      const success = await fetchFromFreeAPI();
      
      // Ücretsiz API başarısız olursa ücretli API'ye geç
      if (!success) {
        console.log('⚠️  Ücretsiz API başarısız - Ücretli API\'ye geçiliyor');
        currentApiType = 'paid';
        await fetchFromPaidAPI();
        scheduleFetch(); // 30 saniye aralığa geç
      }
    } else {
      await fetchFromPaidAPI();
    }
  }, interval);
  
  console.log(`⏰ Fetch planlandı: Her ${interval / 1000} saniye`);
}

// Sunucu başlangıcında fetch'i başlat (sadece production)
if (process.env.NODE_ENV !== 'test') {
  setTimeout(startAutoFetch, 2000); // 2 saniye bekle
}

// ===================================
// API ENDPOINTS
// ===================================

/**
 * Kullanıcılar için fiyat endpoint'i
 * Memory cache'den okur (MongoDB yok!)
 */
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

    // Memory cache kontrolü
    if (!priceCache.data) {
      return res.status(503).json({
        success: false,
        message: 'Fiyat verisi henüz yüklenmedi. Lütfen birkaç saniye bekleyin.',
        error: priceCache.error
      });
    }

    const prices = priceCache.data;
    const finalPrices = {};

    // Marjları uygula
    Object.keys(prices).forEach(key => {
      const parts = key.split('_');
      const type = parts[parts.length - 1];

      const marjKey = `${key}_marj`;
      const marj = user.marjlar?.[marjKey] || 0;

      if (type === 'alis') finalPrices[key] = (prices[key] || 0) - marj;
      else if (type === 'satis') finalPrices[key] = (prices[key] || 0) + marj;
      else finalPrices[key] = prices[key];
    });

    const cacheAge = priceCache.lastFetch 
      ? Math.floor((Date.now() - priceCache.lastFetch) / 1000)
      : null;

    res.json({
      success: true,
      data: finalPrices,
      metadata: {
        source: priceCache.source,
        sourceName: priceCache.source === 'free_api' 
          ? '🟢 Ücretsiz API' 
          : '🟡 Ücretli API',
        fetchedAt: priceCache.lastFetch,
        cacheAge: cacheAge,
        refreshInterval: currentApiType === 'free' ? '15 saniye' : '30 saniye',
        isRealtime: cacheAge < 20,
        message: `${cacheAge} saniye önce güncellendi`
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