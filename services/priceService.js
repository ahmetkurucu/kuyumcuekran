const axios = require('axios');

// --- PAID API ONLY ---
const API_CONFIG = {
  PAID: {
    url: 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
    dynamicId: process.env.RAPIDAPI_DYNAMIC_ID || '23b4c2fb31a242d1eebc0df9b9b65e5e',
    timeout: 5000,
    intervalMs: 30000, // Default: 30 saniye (mesai saatlerinde kullanılacak)
    headers: {
      'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || ''
    },
    name: 'smokinyazilim'
  }
};

/**
 * Mesai saatlerine göre dinamik cache süresi hesaplar
 * - Hafta içi 09:30-20:00: 30 saniye
 * - Cumartesi 09:30-14:00: 30 saniye
 * - Diğer saatler: 2 saat (7200000 ms)
 */
function getDynamicCacheInterval() {
  const now = new Date();
  const day = now.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Pazar günü: 2 saatte bir
  if (day === 0) {
    return 7200000; // 2 saat
  }

  // Cumartesi: 09:30-14:00 arası 30 saniye, diğer saatler 2 saat
  if (day === 6) {
    const start = 9 * 60 + 30;  // 09:30 = 570 dakika
    const end = 14 * 60;         // 14:00 = 840 dakika
    
    if (totalMinutes >= start && totalMinutes < end) {
      return 30000; // 30 saniye
    } else {
      return 7200000; // 2 saat
    }
  }

  // Hafta içi (Pazartesi-Cuma): 09:30-20:00 arası 30 saniye, diğer saatler 2 saat
  const start = 9 * 60 + 30;  // 09:30 = 570 dakika
  const end = 20 * 60;         // 20:00 = 1200 dakika

  if (totalMinutes >= start && totalMinutes < end) {
    return 30000; // 30 saniye
  } else {
    return 7200000; // 2 saat
  }
}

function parseRapidAPIData(dataArray) {
  const result = {};
  
  // smokinyazilim formatı: key, buy, sell
  const keyMapping = {
    'GRAM ALTIN': 'KULCEALTIN',
    'YENİ ÇEYREK': 'CEYREK_YENI',
    'ESKİ ÇEYREK': 'CEYREK_ESKI',
    'YENİ YARIM': 'YARIM_YENI',
    'ESKİ YARIM': 'YARIM_ESKI',
    'YENİ TAM': 'TEK_YENI',
    'ESKİ TAM': 'TEK_ESKI',
    'YENİ ATA': 'ATA_YENI',
    'ESKİ ATA': 'ATA_ESKI',
    'Has Altın': 'ALTIN',  // ← Has Altın
    '22 AYAR': 'AYAR22',
    'GÜMÜŞ': 'GUMUS'
    // ONS kaldırıldı - Has Altın kullanılacak
  };

  dataArray.forEach(item => {
    const key = item.key || item.name;
    const mappedKey = keyMapping[key];
    
    if (mappedKey) {
      // Fiyatları parse et - virgül ve nokta temizle
      let buyPrice = 0;
      let sellPrice = 0;
      
      if (item.buy) {
        // Binlik ayracı noktayı kaldır, ondalık virgülü noktaya çevir
        buyPrice = parseFloat(String(item.buy).replace(/\./g, '').replace(',', '.')) || 0;
      }
      
      if (item.sell) {
        sellPrice = parseFloat(String(item.sell).replace(/\./g, '').replace(',', '.')) || 0;
      }
      
      result[`${mappedKey}_alis`] = buyPrice;
      result[`${mappedKey}_satis`] = sellPrice;
    }
  });

  // Dolar ve Euro - API'de yoksa 0 yap
  if (!result.USDTRY_alis) result.USDTRY_alis = 0;
  if (!result.USDTRY_satis) result.USDTRY_satis = 0;
  if (!result.EURTRY_alis) result.EURTRY_alis = 0;
  if (!result.EURTRY_satis) result.EURTRY_satis = 0;

  return result;
}

async function fetchFromPaidAPI() {
  if (!API_CONFIG.PAID.headers['x-rapidapi-key']) {
    throw new Error('RAPIDAPI_KEY environment variable is required');
  }

  // Dynamic ID'yi URL'e ekle
  const fullUrl = `${API_CONFIG.PAID.url}/${API_CONFIG.PAID.dynamicId}`;
  
  const r = await axios.get(fullUrl, {
    timeout: API_CONFIG.PAID.timeout,
    headers: API_CONFIG.PAID.headers
  });

  if (!r.data || !r.data.data) {
    throw new Error('Paid API: Invalid response format');
  }

  const normalized = parseRapidAPIData(r.data.data);

  // TCMB kur bilgisi (best-effort)
  try {
    const xml2js = require('xml2js');
    const tcmb = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 5000 });
    const parser = new xml2js.Parser();
    const parsed = await parser.parseStringPromise(tcmb.data);

    const currencies = parsed?.Tarih_Date?.Currency || [];
    const usd = currencies.find(c => c?.$?.CurrencyCode === 'USD');
    const eur = currencies.find(c => c?.$?.CurrencyCode === 'EUR');

    if (usd) {
      normalized.USDTRY_alis = parseFloat(usd.ForexBuying?.[0]) || 0;
      normalized.USDTRY_satis = parseFloat(usd.ForexSelling?.[0]) || 0;
    }
    if (eur) {
      normalized.EURTRY_alis = parseFloat(eur.ForexBuying?.[0]) || 0;
      normalized.EURTRY_satis = parseFloat(eur.ForexSelling?.[0]) || 0;
    }
  } catch {
    // TCMB hatası sistemi durdurmasın
  }

  return normalized;
}

// --- In-memory cache ---
const state = {
  cache: null,
  cacheUpdatedAt: 0,
  lastSource: 'paid_api',
  lastError: null,
  paidCalls: 0
};

// API kullanım logları
async function logApiUsage(context, source, success, errorMessage, responseTimeMs) {
  try {
    const ApiUsageLog = require('../models/ApiUsageLog');
    await ApiUsageLog.create({
      userId: context?.userId || null,
      username: context?.username || null,
      role: context?.role || null,
      ip: context?.ip || null,
      userAgent: context?.userAgent || null,
      endpoint: context?.endpoint || null,
      source,
      success: !!success,
      responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : null,
      errorMessage: errorMessage || null
    });
  } catch {
    // Log hatası sistemi durdurmasın
  }
}

async function logPaidUsage(context, ok, errMsg, responseTimeMs) {
  try {
    const PaidApiLog = require('../models/PaidApiLog');
    await PaidApiLog.create({
      userId: context?.userId || null,
      username: context?.username || null,
      role: context?.role || null,
      ip: context?.ip || null,
      userAgent: context?.userAgent || null,
      endpoint: context?.endpoint || null,
      success: ok,
      responseTimeMs: responseTimeMs || null,
      errorMessage: errMsg || null
    });
  } catch (e) {
    console.warn('PaidApiLog write failed:', e.message);
  }
}

function getStatus() {
  const now = Date.now();
  return {
    lastSource: state.lastSource,
    cacheUpdatedAt: state.cacheUpdatedAt ? new Date(state.cacheUpdatedAt) : null,
    cacheAgeMs: state.cacheUpdatedAt ? (now - state.cacheUpdatedAt) : null,
    paidCalls: state.paidCalls,
    lastError: state.lastError
  };
}

async function getPrices(context = {}) {
  const now = Date.now();
  
  // Dinamik cache süresi hesapla (mesai saatlerine göre)
  const currentCacheInterval = getDynamicCacheInterval();

  // Cache kontrolü (dinamik süre)
  if (state.cache && (now - state.cacheUpdatedAt < currentCacheInterval)) {
    return { 
      data: state.cache, 
      source: 'paid_api', 
      cached: true,
      cacheIntervalMs: currentCacheInterval,
      status: getStatus() 
    };
  }

  // Paid API'den çek
  const t0 = Date.now();
  try {
    const paidData = await fetchFromPaidAPI();
    const dt = Date.now() - t0;

    state.cache = paidData;
    state.cacheUpdatedAt = Date.now();
    state.lastSource = 'paid_api';
    state.lastError = null;
    state.paidCalls += 1;

    await logPaidUsage(context, true, null, dt);
    await logApiUsage(context, 'paid_api', true, null, dt);

    return { 
      data: state.cache, 
      source: 'paid_api', 
      cached: false, 
      status: getStatus(), 
      responseTimeMs: dt 
    };
  } catch (e) {
    const dt = Date.now() - t0;
    state.lastError = `PAID API ERROR: ${e.message}`;
    state.paidCalls += 1;

    await logPaidUsage(context, false, e.message, dt);
    await logApiUsage(context, 'paid_api', false, e.message, dt);

    // Eğer cache varsa onu döndür (stale)
    if (state.cache) {
      return { 
        data: state.cache, 
        source: 'paid_api', 
        cached: true, 
        stale: true, 
        status: getStatus() 
      };
    }

    throw new Error('Paid API failed and no cache available: ' + e.message);
  }
}

async function forceRefresh(options = {}, context = {}) {
  // Force refresh - always call paid API
  const t0 = Date.now();
  const paidData = await fetchFromPaidAPI();
  const dt = Date.now() - t0;

  state.cache = paidData;
  state.cacheUpdatedAt = Date.now();
  state.lastSource = 'paid_api';
  state.lastError = null;
  state.paidCalls += 1;

  await logPaidUsage(context, true, null, dt);
  await logApiUsage(context, 'paid_api', true, null, dt);

  return { 
    data: state.cache, 
    source: 'paid_api', 
    cached: false, 
    status: getStatus(), 
    responseTimeMs: dt 
  };
}

module.exports = {
  getPrices,
  forceRefresh,
  getStatus
};
