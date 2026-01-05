const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const CachedPrice = require('../models/CachedPrice');
const User = require('../models/User');

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
  
  // USD/EUR döviz kuru API'sinden gelecek
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
      'x-rapidapi-key': '259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
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
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.data || !response.data.data) {
      throw new Error('Geçersiz veri formatı');
    }

    const rawData = response.data.data;
    
    // Ücretsiz API formatını normalize et
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
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ÜCRETLİ API'den veri çek
 */
async function fetchFromPaidAPI() {
  try {
    // 1. Altın fiyatları
    const response = await axios.get(API_CONFIG.PAID.url, {
      timeout: API_CONFIG.PAID.timeout,
      headers: API_CONFIG.PAID.headers
    });

    if (!response.data || !response.data.data) {
      throw new Error('Ücretli API veri döndürmedi');
    }

    // RapidAPI array formatını parse et
    const normalizedData = parseRapidAPIData(response.data.data);

    // 2. Döviz kurlarını çek (TCMB)
    try {
      console.log('   💱 Döviz kurları çekiliyor (TCMB)...');
      
      const xml2js = require('xml2js');
      
      const tcmbResponse = await axios.get(
        'https://www.tcmb.gov.tr/kurlar/today.xml',
        { timeout: 5000 }
      );
      
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
      
      console.log(`   ✅ TCMB: USD=${normalizedData.USDTRY_satis}, EUR=${normalizedData.EURTRY_satis}`);
      
    } catch (exchangeError) {
      console.warn('   ⚠️  TCMB hatası:', exchangeError.message);
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
    return {
      success: false,
      error: error.message
    };
  }
}

// SADECE SUPER ADMIN API'den fiyat çekebilir
router.post('/fetch-from-api', authenticateToken, async (req, res) => {
  try {
    // Super Admin kontrolü
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için Super Admin yetkisi gerekli'
      });
    }

    console.log('🔄 Manuel API fetch başlatıldı (Super Admin)');

    // 1. ÜCRETSİZ API'yi dene
    console.log('   → Önce ücretsiz API deneniyor...');
    const freeResult = await fetchFromFreeAPI();
    
    let finalResult;
    let usedPaidAPI = false;

    if (freeResult.success) {
      console.log('   ✅ Ücretsiz API başarılı!');
      finalResult = freeResult;
    } else {
      // 2. Ücretsiz başarısız, ücretli API'ye geç
      console.log('   ⚠️  Ücretsiz API başarısız');
      console.log('   → Ücretli API\'ye geçiliyor...');
      
      const paidResult = await fetchFromPaidAPI();
      
      if (paidResult.success) {
        console.log('   ✅ Ücretli API başarılı!');
        finalResult = paidResult;
        usedPaidAPI = true;
      } else {
        throw new Error('Hiçbir API\'den veri alınamadı');
      }
    }

    const apiData = finalResult.data;

    // Fiyatları parse et
    const prices = {
      ALTIN_alis: parseFloat(apiData.ALTIN_alis) || 0,
      ALTIN_satis: parseFloat(apiData.ALTIN_satis) || 0,
      KULCEALTIN_alis: parseFloat(apiData.KULCEALTIN_alis) || 0,
      KULCEALTIN_satis: parseFloat(apiData.KULCEALTIN_satis) || 0,
      AYAR22_alis: parseFloat(apiData.AYAR22_alis) || 0,
      AYAR22_satis: parseFloat(apiData.AYAR22_satis) || 0,
      CEYREK_YENI_alis: parseFloat(apiData.CEYREK_YENI_alis) || 0,
      CEYREK_YENI_satis: parseFloat(apiData.CEYREK_YENI_satis) || 0,
      CEYREK_ESKI_alis: parseFloat(apiData.CEYREK_ESKI_alis) || 0,
      CEYREK_ESKI_satis: parseFloat(apiData.CEYREK_ESKI_satis) || 0,
      YARIM_YENI_alis: parseFloat(apiData.YARIM_YENI_alis) || 0,
      YARIM_YENI_satis: parseFloat(apiData.YARIM_YENI_satis) || 0,
      YARIM_ESKI_alis: parseFloat(apiData.YARIM_ESKI_alis) || 0,
      YARIM_ESKI_satis: parseFloat(apiData.YARIM_ESKI_satis) || 0,
      TEK_YENI_alis: parseFloat(apiData.TEK_YENI_alis) || 0,
      TEK_YENI_satis: parseFloat(apiData.TEK_YENI_satis) || 0,
      TEK_ESKI_alis: parseFloat(apiData.TEK_ESKI_alis) || 0,
      TEK_ESKI_satis: parseFloat(apiData.TEK_ESKI_satis) || 0,
      ATA_YENI_alis: parseFloat(apiData.ATA_YENI_alis) || 0,
      ATA_YENI_satis: parseFloat(apiData.ATA_YENI_satis) || 0,
      USDTRY_alis: parseFloat(apiData.USDTRY_alis) || 0,
      USDTRY_satis: parseFloat(apiData.USDTRY_satis) || 0,
      EURTRY_alis: parseFloat(apiData.EURTRY_alis) || 0,
      EURTRY_satis: parseFloat(apiData.EURTRY_satis) || 0
    };

    // MongoDB'ye kaydet
    const cachedPrice = new CachedPrice({
      prices: prices,
      fetchedBy: req.user.id,
      fetchedAt: new Date(),
      source: finalResult.source // 'free_api' veya 'paid_api'
    });

    await cachedPrice.save();

    res.json({
      success: true,
      message: `Fiyatlar başarıyla çekildi (${finalResult.sourceName})`,
      data: prices,
      fetchedAt: cachedPrice.fetchedAt,
      metadata: {
        source: finalResult.source,
        sourceName: finalResult.sourceName,
        usedPaidAPI: usedPaidAPI
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
    // 1. ÖNCE ÜCRETSİZ API'Yİ TEST ET (hızlı test - 3 sn timeout)
    console.log('🔍 Ücretsiz API test ediliyor...');
    
    const freeApiTest = await testFreeAPI();
    
    // 2. ÜCRETSİZ API ÇALIŞIYORSA DİREKT ÇEK
    if (freeApiTest.working) {
      console.log('✅ Ücretsiz API çalışıyor - Realtime veri dönülüyor');
      
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
    
    // 3. ÜCRETSİZ API ÇALIŞMIYORSA CACHE'DEN OKU
    console.log('⚠️  Ücretsiz API çalışmıyor - Cache kullanılıyor');
    
    const cachedPrice = await CachedPrice
      .findOne()
      .sort({ fetchedAt: -1 })
      .limit(1);

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

/**
 * Ücretsiz API'yi hızlı test et (3 sn timeout)
 */
async function testFreeAPI() {
  try {
    const response = await axios.get(API_CONFIG.FREE.url, {
      timeout: 3000, // 3 saniye timeout
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    const working = !!(response.data && response.data.data);
    
    return {
      working: working,
      status: response.status
    };
  } catch (error) {
    return {
      working: false,
      error: error.message
    };
  }
}

// API istatistiklerini getir (Sadece ücretli API)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Sadece Super Admin görebilir
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu sayfaya erişim yetkiniz yok'
      });
    }

    // Bu ayın başlangıcı
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Sadece ücretli API kullanımı
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
    console.log('🔄 Cron job tetiklendi:', new Date().toISOString());
    
    // Vercel Cron secret kontrolü (production'da)
    if (process.env.NODE_ENV === 'production') {
      const authHeader = req.headers.authorization;
      const cronSecret = process.env.CRON_SECRET || 'default-secret-change-this';
      
      if (authHeader !== `Bearer ${cronSecret}`) {
        console.warn('⚠️  Unauthorized cron request');
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }
    }

    // Super Admin'i bul
    const User = require('../models/User');
    const superAdmin = await User.findOne({ role: 'superadmin' });
    
    if (!superAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Super Admin bulunamadı'
      });
    }

    // Fiyatları çek
    const result = await fetchPricesWithFallback();
    
    if (!result.success) {
      throw new Error('API\'den veri alınamadı');
    }

    // Cache'e kaydet
    const cachedPrice = new CachedPrice({
      prices: result.data,
      fetchedBy: superAdmin._id,
      fetchedAt: new Date(),
      source: result.source,
      lastApiStatus: {
        freeApiWorking: result.source === 'free_api',
        paidApiWorking: result.source === 'paid_api',
        bothApiFailed: false
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

// Uptime Robot için - Sadece ücretli API çalıştır
router.post('/cron-fetch-paid', async (req, res) => {
  try {
    console.log('🤖 Uptime Robot cron tetiklendi:', new Date().toISOString());
    
    // 1. ÜCRETSİZ API TEST ET
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
    
    // 2. ÜCRETSİZ API ÇALIŞMIYOR - ÜCRETLİ API'DEN ÇEK
    console.log('⚠️  Ücretsiz API çalışmıyor - Ücretli API kullanılıyor');
    
    const paidResult = await fetchFromPaidAPI();
    
    if (!paidResult.success) {
      throw new Error('Ücretli API başarısız: ' + paidResult.error);
    }
    
    // 3. CACHE'E KAYDET
    const cachedPrice = new CachedPrice({
      prices: paidResult.data,
      fetchedBy: null, // Cron job
      fetchedAt: new Date(),
      source: 'paid_api'
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