require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB bağlantısı başarılı');
    startAutoFetch();
  })
  .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cache', require('./routes/apiCache'));
app.use('/api/fiyat', require('./routes/fiyat'));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Catch-all route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  const filePath = path.join(__dirname, 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ 
        success: false, 
        message: 'Sayfa bulunamadı: ' + req.path
      });
    }
  });
});

// Hata Handler
app.use((err, req, res, next) => {
  console.error('Server hatası:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ========================================
// 🔄 FALLBACK API SİSTEMİ
// ========================================

const CachedPrice = require('./models/CachedPrice');
const User = require('./models/User');

let fetchInterval = null;
let fetchCount = 0;
let freeApiFailCount = 0;
let paidApiUsageCount = 0;

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
  
  // USD/EUR döviz kuru API'sinden gelecek, burada 0 koy
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
      timeout: API_CONFIG.FREE.timeout
    });

    if (!response.data) {
      throw new Error('Ücretsiz API veri döndürmedi');
    }

    const apiData = response.data;
    
    // Veri validasyonu - en az bir fiyat var mı?
    if (!apiData.KULCEALTIN_satis || parseFloat(apiData.KULCEALTIN_satis) === 0) {
      throw new Error('Ücretsiz API geçersiz veri döndürdü');
    }

    return {
      success: true,
      source: 'free_api',
      data: apiData
    };

  } catch (error) {
    console.warn('⚠️  Ücretsiz API hatası:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ÜCRETLİ API'den veri çek (RapidAPI)
 * + Döviz kuru API'si ekle
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
    
    // 2. Döviz kurlarını çek (TCMB - Merkez Bankası)
    try {
      console.log('   💱 Döviz kurları çekiliyor (TCMB)...');
      
      const xml2js = require('xml2js');
      
      const tcmbResponse = await axios.get(
        'https://www.tcmb.gov.tr/kurlar/today.xml',
        { timeout: 5000 }
      );
      
      // XML'i parse et
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(tcmbResponse.data);
      
      const currencies = result.Tarih_Date.Currency;
      
      // USD bul
      const usd = currencies.find(c => c.$.CurrencyCode === 'USD');
      if (usd) {
        normalizedData.USDTRY_alis = parseFloat(usd.ForexBuying?.[0]) || 0;
        normalizedData.USDTRY_satis = parseFloat(usd.ForexSelling?.[0]) || 0;
      }
      
      // EUR bul
      const eur = currencies.find(c => c.$.CurrencyCode === 'EUR');
      if (eur) {
        normalizedData.EURTRY_alis = parseFloat(eur.ForexBuying?.[0]) || 0;
        normalizedData.EURTRY_satis = parseFloat(eur.ForexSelling?.[0]) || 0;
      }
      
      console.log(`   ✅ TCMB: USD=${normalizedData.USDTRY_satis}, EUR=${normalizedData.EURTRY_satis}`);
      
    } catch (exchangeError) {
      console.warn('   ⚠️  TCMB API hatası:', exchangeError.message);
      // Döviz kuru alamadık ama devam et
      normalizedData.USDTRY_alis = 0;
      normalizedData.USDTRY_satis = 0;
      normalizedData.EURTRY_alis = 0;
      normalizedData.EURTRY_satis = 0;
    }
    
    paidApiUsageCount++;
    
    return {
      success: true,
      source: 'paid_api',
      data: normalizedData
    };

  } catch (error) {
    console.error('❌ Ücretli API hatası:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * FALLBACK SİSTEMİ: Önce ücretsiz, başarısız olursa ücretli
 */
async function fetchPricesWithFallback() {
  console.log('🔄 API\'den fiyatlar çekiliyor...');
  
  // 1. ÜCRETSİZ API'yi dene
  console.log('   → Önce ücretsiz API deneniyor...');
  const freeResult = await fetchFromFreeAPI();
  
  if (freeResult.success) {
    console.log('   ✅ Ücretsiz API başarılı!');
    freeApiFailCount = 0; // Başarı sayacını sıfırla
    return freeResult;
  }

  // 2. Ücretsiz başarısız, ÜCRETLİ API'ye geç
  freeApiFailCount++;
  console.log(`   ⚠️  Ücretsiz API başarısız (${freeApiFailCount}. deneme)`);
  console.log('   → Ücretli API\'ye geçiliyor... (RapidAPI)');
  
  const paidResult = await fetchFromPaidAPI();
  
  if (paidResult.success) {
    console.log('   ✅ Ücretli API başarılı!');
    console.log(`   💰 Ücretli API kullanım sayısı: ${paidApiUsageCount}`);
    return paidResult;
  }

  // 3. Her iki API de başarısız
  console.error('   ❌ Tüm API\'ler başarısız!');
  throw new Error('Hiçbir API\'den veri alınamadı');
}

/**
 * API'den fiyatları çek ve cache'le
 */
async function fetchPricesFromAPI() {
  try {
    // Super Admin'i bul
    const superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      console.log('⚠️  Super Admin bulunamadı, fetch atlanıyor');
      return;
    }

    // FALLBACK sistemi ile veri çek
    const result = await fetchPricesWithFallback();
    
    // Her iki API de başarısız mı?
    const bothApiFailed = !result.success;
    
    if (bothApiFailed) {
      console.error('❌ TÜM API\'LER BAŞARISIZ!');
      
      // Başarısızlık durumunu kaydet
      const failedCache = new CachedPrice({
        prices: {}, // Boş fiyat
        fetchedBy: superAdmin._id,
        fetchedAt: new Date(),
        source: 'all_apis_failed',
        lastApiStatus: {
          freeApiWorking: false,
          paidApiWorking: false,
          bothApiFailed: true,
          lastFailTime: new Date()
        }
      });
      await failedCache.save();
      
      fetchCount++;
      return;
    }
    
    const apiData = result.data;

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
      fetchedBy: superAdmin._id,
      fetchedAt: new Date(),
      source: result.source, // 'free_api' veya 'paid_api'
      lastApiStatus: {
        freeApiWorking: result.source === 'free_api',
        paidApiWorking: result.source === 'paid_api',
        bothApiFailed: false,
        lastFailTime: null
      }
    });

    await cachedPrice.save();
    
    fetchCount++;
    console.log(`✅ Fiyatlar cache'lendi (Fetch #${fetchCount})`);
    console.log(`📊 Kaynak: ${result.source === 'free_api' ? 'ÜCRETSİZ API' : 'ÜCRETLİ API (RapidAPI)'}`);
    console.log(`💰 Gram Altın = ${prices.KULCEALTIN_satis}₺`);

  } catch (error) {
    console.error('❌ Fetch hatası:', error.message);
  }
}

/**
 * Şu anki saate göre fetch aralığını hesapla
 */
function getFetchInterval() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  if (day === 0) return 30 * 60 * 1000; // Pazar: 30 dakika
  if (hour >= 9 && hour < 20) return 15 * 1000; // Piyasa: 15 saniye
  return 30 * 60 * 1000; // Gece: 30 dakika
}

/**
 * Log durumu
 */
function logFetchStatus() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  
  let mod = day === 0 ? 'PAZAR (TATİL)' : 
            (hour >= 9 && hour < 20) ? 'PİYASA SAATİ' : 'GECE SAATİ';
  let interval = (day === 0 || (hour < 9 || hour >= 20)) ? '30 dakika' : '15 saniye';
  
  console.log('\n📊 FETCH DURUMU');
  console.log('─────────────────────────────');
  console.log(`🕐 Zaman: ${now.toLocaleTimeString('tr-TR')}`);
  console.log(`📅 Gün: ${['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][day]}`);
  console.log(`⏰ Mod: ${mod}`);
  console.log(`⚡ Aralık: ${interval}`);
  console.log(`📈 Toplam Fetch: ${fetchCount}`);
  console.log(`💰 Ücretli API Kullanım: ${paidApiUsageCount}`);
  console.log(`⚠️  Ücretsiz API Başarısızlık: ${freeApiFailCount}`);
  console.log('─────────────────────────────\n');
}

/**
 * Fetch sistemini başlat
 */
function startAutoFetch() {
  console.log('\n🚀 OTOMATİK FALLBACK SİSTEMİ BAŞLATILDI');
  console.log('==========================================');
  console.log('📋 Öncelik Sırası:');
  console.log('   1️⃣  Ücretsiz API (haremaltin.com)');
  console.log('   2️⃣  Ücretli API (RapidAPI) - Fallback');
  console.log('==========================================\n');
  
  fetchPricesFromAPI();
  logFetchStatus();
  scheduleFetch();
  
  // Her saat interval'i yeniden hesapla
  setInterval(() => {
    if (fetchInterval) {
      clearInterval(fetchInterval);
      scheduleFetch();
      logFetchStatus();
    }
  }, 60 * 60 * 1000);
}

/**
 * Fetch'i zamanla
 */
function scheduleFetch() {
  const interval = getFetchInterval();
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  
  fetchInterval = setInterval(() => {
    fetchPricesFromAPI();
    logFetchStatus();
  }, interval);
  
  let mod = day === 0 ? 'PAZAR (TATİL) - Her 30 dakika' :
            (hour >= 9 && hour < 20) ? 'PİYASA SAATİ - Her 15 saniye' :
            'GECE SAATİ - Her 30 dakika';
  
  console.log(`⏰ Fetch planlandı: ${mod}`);
}

// ========================================
// SERVER BAŞLATMA
// ========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n=================================');
  console.log(`🚀 Kuyumcu Vitrin Mini`);
  console.log(`📺 Sunucu: http://localhost:${PORT}`);
  console.log(`⏰ Token Süresi: ${process.env.JWT_EXPIRES_IN}`);
  console.log(`⚡ Cache: Aktif (Fallback Sistemi)`);
  console.log('=================================\n');
  
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  if (day === 0) {
    console.log('📅 PAZAR - Her 30 dakika\n');
  } else if (hour >= 9 && hour < 20) {
    console.log('📈 PİYASA SAATİ - Her 15 saniye\n');
  } else {
    console.log('🌙 GECE SAATİ - Her 30 dakika\n');
  }
});

module.exports = app;