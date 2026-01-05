const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const CachedPrice = require('../models/CachedPrice');
const User = require('../models/User');
const connectDB = require('../config/db');

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

// API Yapılandırması
const API_CONFIG = {
  FREE: {
    url: 'https://canlipiyasalar.haremaltin.com/tmp/altin.json',
    timeout: 5000,
    name: 'ÜCRETSİZ'
  },
  PAID: {
    url: 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
    timeout: 5000,
    headers: {
      'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY // ✅ ENV
    },
    name: 'ÜCRETLİ (RapidAPI)'
  }
};

/**
 * ÜCRETSİZ API'den veri çek
 */
async function fetchFromFreeAPI() {
  try {
    const response = await axios.get(API_CONFIG.FREE.url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.data || !response.data.data) throw new Error('Geçersiz veri formatı');

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

    return {
      success: true,
      source: 'free_api',
      sourceName: API_CONFIG.FREE.name,
      data: normalizedData
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ÜCRETLİ API'den veri çek (RapidAPI) + TCMB döviz
 */
async function fetchFromPaidAPI() {
  try {
    if (!process.env.RAPIDAPI_KEY) {
      throw new Error('RAPIDAPI_KEY ENV tanımlı değil');
    }

    const response = await axios.get(API_CONFIG.PAID.url, {
      timeout: API_CONFIG.PAID.timeout,
      headers: API_CONFIG.PAID.headers
    });

    if (!response.data || !response.data.data) {
      throw new Error('Ücretli API veri döndürmedi');
    }

    const normalizedData = parseRapidAPIData(response.data.data);

    // TCMB döviz
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
    } catch (exchangeError) {
      normalizedData.USDTRY_alis = 0;
      normalizedData.USDTRY_satis = 0;
      normalizedData.EURTRY_alis = 0;
      normalizedData.EURTRY_satis = 0;
    }

    return {
      success: true,
      source: 'paid_api',
      sourceName: API_CONFIG.PAID.name,
      data: normalizedData
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ✅ Eksik olan fonksiyon: Cron burada bunu çağırıyordu.
 * Önce ücretsiz, olmazsa ücretli.
 */
async function fetchPricesWithFallback() {
  const freeResult = await fetchFromFreeAPI();
  if (freeResult.success) return freeResult;

  const paidResult = await fetchFromPaidAPI();
  if (paidResult.success) return paidResult;

  return { success: false, error: 'Hiçbir API’den veri alınamadı' };
}

/**
 * Ücretsiz API'yi hızlı test et (3 sn)
 */
async function testFreeAPI() {
  try {
    const response = await axios.get(API_CONFIG.FREE.url, {
      timeout: 3000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const working = !!(response.data && response.data.data);
    return { working, status: response.status };
  } catch (error) {
    return { working: false, error: error.message };
  }
}

// SADECE SUPER ADMIN API'den fiyat çekebilir
router.post('/fetch-from-api', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için Super Admin yetkisi gerekli'
      });
    }

    const result = await fetchPricesWithFallback();
    if (!result.success) throw new Error(result.error || 'API’den veri alınamadı');

    const cachedPrice = new CachedPrice({
      prices: result.data,
      fetchedBy: req.user.id,
      fetchedAt: new Date(),
      source: result.source
    });

    await cachedPrice.save();

    res.json({
      success: true,
      message: `Fiyatlar başarıyla çekildi (${result.sourceName})`,
      data: result.data,
      fetchedAt: cachedPrice.fetchedAt,
      metadata: {
        source: result.source,
        sourceName: result.sourceName,
        usedPaidAPI: result.source === 'paid_api'
      }
    });

  } catch (error) {
    console.error('❌ API fetch hatası:', error);
    res.status(500).json({
      success: false,
      message: 'API\'den fiyat çekilemedi',
      error: error.message
    });
  }
});

// HİBRİT SİSTEM: Ücretsiz API çalışıyorsa direkt, yoksa cache
router.get('/cached', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const freeApiTest = await testFreeAPI();

    if (freeApiTest.working) {
      const freshData = await fetchFromFreeAPI();
      if (freshData.success) {
        return res.json({
          success: true,
          data: freshData.data,
          metadata: {
            source: 'free_api_realtime',
            sourceName: '🟢 Ücretsiz API (Realtime)',
            fetchedAt: new Date(),
            cacheAge: 0,
            isRealtime: true,
            message: 'Güncel veri - Direkt API\'den'
          }
        });
      }
    }

    const cachedPrice = await CachedPrice.findOne().sort({ fetchedAt: -1 }).limit(1);

    if (!cachedPrice) {
      return res.status(404).json({
        success: false,
        message: 'Cache\'de fiyat bulunamadı. Lütfen bekleyin.'
      });
    }

    const now = new Date();
    const cacheAge = Math.floor((now - cachedPrice.fetchedAt) / 1000);

    res.json({
      success: true,
      data: cachedPrice.prices,
      metadata: {
        source: 'paid_api_cache',
        sourceName: '🟡 Ücretli API (Cache)',
        fetchedAt: cachedPrice.fetchedAt,
        cacheAge: cacheAge,
        isRealtime: false,
        message: `Cache veri - ${cacheAge} saniye önce güncellendi`
      }
    });

  } catch (error) {
    console.error('Cache okuma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Cache\'den fiyat okunamadı',
      error: error.message
    });
  }
});

// API istatistikleri getir (Sadece ücretli API)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu sayfaya erişim yetkiniz yok'
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidApiUsage = await CachedPrice.countDocuments({
      source: 'paid_api',
      fetchedAt: { $gte: monthStart }
    });

    res.json({
      success: true,
      data: {
        paidApiUsage,
        monthStart: monthStart,
        lastUpdate: now,
        limit: 250000
      }
    });

  } catch (error) {
    console.error('İstatistik hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınamadı',
      error: error.message
    });
  }
});

// Vercel Cron Job için endpoint
router.get('/cron-fetch', async (req, res) => {
  try {
    await connectDB();

    console.log('🔄 Cron job tetiklendi:', new Date().toISOString());

    if (process.env.NODE_ENV === 'production') {
      const authHeader = req.headers.authorization;
      const cronSecret = process.env.CRON_SECRET || 'default-secret-change-this';

      if (authHeader !== `Bearer ${cronSecret}`) {
        console.warn('⚠️ Unauthorized cron request');
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
    }

    const superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      return res.status(500).json({ success: false, message: 'Super Admin bulunamadı' });
    }

    const result = await fetchPricesWithFallback();
    if (!result.success) throw new Error(result.error || 'API\'den veri alınamadı');

    const cachedPrice = new CachedPrice({
      prices: result.data,
      fetchedBy: superAdmin._id,
      fetchedAt: new Date(),
      source: result.source,
      lastApiStatus: {
        freeApiWorking: result.source === 'free_api',
        paidApiWorking: result.source === 'paid_api',
        bothApiFailed: false,
        lastFailTime: null
      }
    });

    await cachedPrice.save();

    console.log('✅ Cron job başarılı - Kaynak:', result.source);

    res.json({
      success: true,
      message: 'Fiyatlar başarıyla güncellendi',
      source: result.source,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Cron job hatası:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Uptime Robot için - Ücretsiz çalışmıyorsa ücretliyle cache güncelle
router.post('/cron-fetch-paid', async (req, res) => {
  try {
    await connectDB();

    console.log('🤖 Uptime Robot cron tetiklendi:', new Date().toISOString());

    const freeTest = await testFreeAPI();
    if (freeTest.working) {
      console.log('✅ Ücretsiz API çalışıyor - Cron atlandı (skip)');
      return res.json({
        success: true,
        message: 'Free API working - Cron skipped',
        skipped: true,
        freeApiStatus: 'working'
      });
    }

    console.log('⚠️ Ücretsiz API çalışmıyor - Ücretli API kullanılıyor');

    const paidResult = await fetchFromPaidAPI();
    if (!paidResult.success) throw new Error('Ücretli API başarısız: ' + paidResult.error);

    const superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      return res.status(500).json({ success: false, message: 'Super Admin bulunamadı' });
    }

    const cachedPrice = new CachedPrice({
      prices: paidResult.data,
      fetchedBy: superAdmin._id, // ✅ null değil
      fetchedAt: new Date(),
      source: 'paid_api',
      lastApiStatus: {
        freeApiWorking: false,
        paidApiWorking: true,
        bothApiFailed: false,
        lastFailTime: null
      }
    });

    await cachedPrice.save();

    console.log('✅ Ücretli API başarılı - Cache güncellendi');

    return res.json({
      success: true,
      message: 'Paid API fetched and cached',
      source: 'paid_api',
      timestamp: new Date().toISOString(),
      skipped: false
    });

  } catch (error) {
    console.error('❌ Cron fetch hatası:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
