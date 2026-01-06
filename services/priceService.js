const axios = require('axios');

// --- FREE & PAID API ---
const API_CONFIG = {
  FREE: {
    url: 'https://canlipiyasalar.haremaltin.com/tmp/altin.json',
    timeout: 5000,
    intervalMs: 15000, // ✅ 15 sn
    name: 'ÜCRETSİZ'
  },
  PAID: {
    url: 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
    timeout: 5000,
    intervalMs: 30000, // ✅ 30 sn
    headers: {
      'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '' // ✅ env’den al
    },
    name: 'ÜCRETLİ (RapidAPI)'
  }
};

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
      const buyPrice = parseFloat(String(item.buy).replace(/\./g, '').replace(',', '.')) || 0;
      const sellPrice = parseFloat(String(item.sell).replace(/\./g, '').replace(',', '.')) || 0;
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

async function fetchFromFreeAPI() {
  const r = await axios.get(API_CONFIG.FREE.url, {
    timeout: API_CONFIG.FREE.timeout,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!r.data || !r.data.data) throw new Error('Free API: geçersiz format');

  const rawData = r.data.data;
  const normalized = {};

  Object.keys(rawData).forEach(key => {
    const item = rawData[key];
    if (item && typeof item === 'object') {
      normalized[`${key}_alis`] = parseFloat(item.alis) || 0;
      normalized[`${key}_satis`] = parseFloat(item.satis) || 0;
    }
  });

  if (!normalized.KULCEALTIN_satis || normalized.KULCEALTIN_satis === 0) {
    throw new Error('Free API: KULCEALTIN boş/0');
  }

  return normalized;
}

async function fetchFromPaidAPI() {
  if (!API_CONFIG.PAID.headers['x-rapidapi-key']) {
    throw new Error('RAPIDAPI_KEY env yok');
  }

  const r = await axios.get(API_CONFIG.PAID.url, {
    timeout: API_CONFIG.PAID.timeout,
    headers: API_CONFIG.PAID.headers
  });

  if (!r.data || !r.data.data) throw new Error('Paid API: veri yok');

  const normalized = parseRapidAPIData(r.data.data);

  // TCMB kur (best-effort)
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
    // sorun değil
  }

  return normalized;
}

// --- In-memory cache (serverless warm instance) ---
const state = {
  cache: null,
  cacheUpdatedAt: 0,
  lastSource: null, // 'free_api' | 'paid_api'
  lastError: null,

  freeFailStreak: 0,
  freeDownUntil: 0,

  // paid usage count (in-memory)
  paidCalls: 0
};

// Free + Paid API çağrılarını MongoDB'ye yaz (SuperAdmin ekranda günlük / IP / kullanıcı takibi için)
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
    // log hatası uygulamayı düşürmesin
  }
}

async function logPaidUsage(context, ok, errMsg, responseTimeMs) {
  try {
    // sadece ücretli API loglanır
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
    // log başarısızsa sistemi bozma
    console.warn('PaidApiLog write failed:', e.message);
  }
}

function getStatus() {
  const now = Date.now();
  return {
    lastSource: state.lastSource,
    cacheUpdatedAt: state.cacheUpdatedAt ? new Date(state.cacheUpdatedAt) : null,
    cacheAgeMs: state.cacheUpdatedAt ? (now - state.cacheUpdatedAt) : null,
    freeFailStreak: state.freeFailStreak,
    freeDownUntil: state.freeDownUntil ? new Date(state.freeDownUntil) : null,
    paidCalls: state.paidCalls,
    lastError: state.lastError
  };
}

async function getPrices(context = {}) {
  const now = Date.now();

  // Cache taze mi?
  if (state.cache && state.lastSource === 'free_api') {
    if (now - state.cacheUpdatedAt < API_CONFIG.FREE.intervalMs) {
      return { data: state.cache, source: 'free_api', cached: true, status: getStatus() };
    }
  }
  if (state.cache && state.lastSource === 'paid_api') {
    if (now - state.cacheUpdatedAt < API_CONFIG.PAID.intervalMs) {
      return { data: state.cache, source: 'paid_api', cached: true, status: getStatus() };
    }
  }

  // 1) Free dene (freeDownUntil değilse)
  const canTryFree = now >= state.freeDownUntil;
  if (canTryFree) {
    try {
      const t0 = Date.now();
      const freeData = await fetchFromFreeAPI();
      const dt = Date.now() - t0;

      state.cache = freeData;
      state.cacheUpdatedAt = Date.now();
      state.lastSource = 'free_api';
      state.lastError = null;
      state.freeFailStreak = 0;

      // Dış API çağrısı logla
      await logApiUsage(context, 'free_api', true, null, dt);

      return { data: state.cache, source: 'free_api', cached: false, status: getStatus(), responseTimeMs: dt };
    } catch (e) {
      // hata süresini de kabaca hesapla
      const dt = 0; // free çağrı t0 kapsamına girmediyse 0 kalsın
      state.freeFailStreak += 1;
      state.lastError = `FREE: ${e.message}`;

      await logApiUsage(context, 'free_api', false, e.message, dt);

      // 3 kez üst üste patlarsa 60 sn free denemeyi durdur
      if (state.freeFailStreak >= 3) {
        state.freeDownUntil = Date.now() + 60000;
      }
    }
  }

  // 2) Paid dene (30 sn aralık kuralı)
  const paidCacheFresh = state.cache && state.lastSource === 'paid_api' && (now - state.cacheUpdatedAt < API_CONFIG.PAID.intervalMs);
  if (!paidCacheFresh) {
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

      return { data: state.cache, source: 'paid_api', cached: false, status: getStatus(), responseTimeMs: dt };
    } catch (e) {
      const dt = Date.now() - t0;
      state.lastError = `PAID: ${e.message}`;
      state.paidCalls += 1;
      await logPaidUsage(context, false, e.message, dt);
      await logApiUsage(context, 'paid_api', false, e.message, dt);
    }
  }

  // 3) Hiçbiri olmadıysa eldeki cache (stale) dön
  if (state.cache) {
    return { data: state.cache, source: state.lastSource, cached: true, stale: true, status: getStatus() };
  }

  throw new Error('Hiçbir API’den veri alınamadı ve cache de boş.');
}

async function forceRefresh({ preferPaid = false } = {}, context = {}) {
  if (preferPaid) {
    // paid zorla
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

    return { data: state.cache, source: 'paid_api', cached: false, status: getStatus(), responseTimeMs: dt };
  }

  // free zorla, olmazsa paid
  return getPrices(context);
}

module.exports = {
  getPrices,
  forceRefresh,
  getStatus
};
