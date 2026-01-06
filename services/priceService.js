const axios = require('axios');

const API_CONFIG = {
  FREE: {
    url: 'https://canlipiyasalar.haremaltin.com/tmp/altin.json',
    timeout: 5000
  },
  PAID: {
    url: 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
    timeout: 5000,
    host: 'harem-altin-live-gold-price-data.p.rapidapi.com'
  }
};

// In-memory cache (Vercel warm instance’larda işe yarar, garanti değil ama pratikte faydalı)
const state = {
  mode: 'free',                 // 'free' | 'paid'
  lastFetchAt: 0,
  lastResult: null,
  lastFreeFailAt: 0,
  lastFreeTestAt: 0
};

const TTL_FREE_MS = 15 * 1000;  // 15 saniye
const TTL_PAID_MS = 30 * 1000;  // 30 saniye

function parseFree(data) {
  if (!data || !data.data) throw new Error('Ücretsiz API formatı geçersiz');
  const raw = data.data;
  const out = {};

  Object.keys(raw).forEach(key => {
    const item = raw[key];
    if (item && typeof item === 'object') {
      out[`${key}_alis`] = parseFloat(item.alis) || 0;
      out[`${key}_satis`] = parseFloat(item.satis) || 0;
    }
  });

  // basit validasyon
  if (!out.KULCEALTIN_satis || out.KULCEALTIN_satis === 0) {
    throw new Error('Ücretsiz API geçersiz veri döndürdü');
  }

  // döviz yoksa 0
  out.USDTRY_alis = out.USDTRY_alis || 0;
  out.USDTRY_satis = out.USDTRY_satis || 0;
  out.EURTRY_alis = out.EURTRY_alis || 0;
  out.EURTRY_satis = out.EURTRY_satis || 0;

  return out;
}

function parseRapidAPIData(arr) {
  const out = {};

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

  (arr || []).forEach(item => {
    const mappedKey = keyMapping[item.key];
    if (!mappedKey) return;

    const buy = parseFloat(String(item.buy || '').replace(/\./g, '').replace(',', '.')) || 0;
    const sell = parseFloat(String(item.sell || '').replace(/\./g, '').replace(',', '.')) || 0;

    out[`${mappedKey}_alis`] = buy;
    out[`${mappedKey}_satis`] = sell;
  });

  // döviz yoksa 0
  out.USDTRY_alis = 0;
  out.USDTRY_satis = 0;
  out.EURTRY_alis = 0;
  out.EURTRY_satis = 0;

  // validasyon
  if (!out.KULCEALTIN_satis || out.KULCEALTIN_satis === 0) {
    throw new Error('Ücretli API geçersiz veri döndürdü');
  }

  return out;
}

async function fetchFree() {
  const r = await axios.get(API_CONFIG.FREE.url, {
    timeout: API_CONFIG.FREE.timeout,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return parseFree(r.data);
}

async function fetchPaid() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY env yok');

  const r = await axios.get(API_CONFIG.PAID.url, {
    timeout: API_CONFIG.PAID.timeout,
    headers: {
      'X-RapidAPI-Host': API_CONFIG.PAID.host,
      'X-RapidAPI-Key': key
    }
  });

  if (!r.data || !r.data.data) throw new Error('Ücretli API veri döndürmedi');
  return parseRapidAPIData(r.data.data);
}

// Ücretsiz API’yi hızlı test (mod paid iken geri dönmek için)
async function testFreeQuick() {
  const r = await axios.get(API_CONFIG.FREE.url, {
    timeout: 2500,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return !!(r.data && r.data.data);
}

async function getPrices() {
  const now = Date.now();

  // Mode’a göre TTL
  const ttl = state.mode === 'free' ? TTL_FREE_MS : TTL_PAID_MS;

  // TTL dolmadıysa cache dön
  if (state.lastResult && (now - state.lastFetchAt) < ttl) {
    return {
      data: state.lastResult,
      source: state.mode,
      cached: true,
      cacheAgeMs: now - state.lastFetchAt,
      ttlMs: ttl
    };
  }

  // 1) Önce FREE dene
  try {
    const freeData = await fetchFree();
    state.mode = 'free';
    state.lastResult = freeData;
    state.lastFetchAt = now;
    state.lastFreeFailAt = 0;

    return {
      data: freeData,
      source: 'free',
      cached: false,
      cacheAgeMs: 0,
      ttlMs: TTL_FREE_MS
    };
  } catch (e) {
    state.lastFreeFailAt = now;
  }

  // 2) FREE patladı → PAID moduna geç
  state.mode = 'paid';

  // paid modundayken arada FREE geri geldi mi diye kontrol (örn: her 60 sn’de bir)
  if ((now - state.lastFreeTestAt) > 60 * 1000) {
    state.lastFreeTestAt = now;
    try {
      const ok = await testFreeQuick();
      if (ok) {
        const freeData = await fetchFree();
        state.mode = 'free';
        state.lastResult = freeData;
        state.lastFetchAt = now;
        state.lastFreeFailAt = 0;

        return {
          data: freeData,
          source: 'free',
          cached: false,
          cacheAgeMs: 0,
          ttlMs: TTL_FREE_MS
        };
      }
    } catch (_) {}
  }

  // 3) PAID çağır (30 sn TTL ile)
  const paidData = await fetchPaid();
  state.lastResult = paidData;
  state.lastFetchAt = now;

  return {
    data: paidData,
    source: 'paid',
    cached: false,
    cacheAgeMs: 0,
    ttlMs: TTL_PAID_MS
  };
}

module.exports = { getPrices };
