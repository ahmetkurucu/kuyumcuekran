const axios = require('axios');

const FREE_URL = 'https://canlipiyasalar.haremaltin.com/tmp/altin.json';
const PAID_URL = 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices';

// Memory cache (Vercel instance içinde)
const state = {
  lastData: null,
  lastAt: 0,
  lastSource: null,
  lastTtlMs: 0,
  lastFreeFailAt: 0
};

function parseFree(resp) {
  const raw = resp?.data;
  if (!raw) throw new Error('Free API format hatası');

  const out = {};
  for (const k of Object.keys(raw)) {
    const item = raw[k];
    if (item && typeof item === 'object') {
      out[`${k}_alis`] = Number(item.alis) || 0;
      out[`${k}_satis`] = Number(item.satis) || 0;
    }
  }
  if (!out.KULCEALTIN_satis) throw new Error('Free API geçersiz veri');

  out.USDTRY_alis ||= 0; out.USDTRY_satis ||= 0;
  out.EURTRY_alis ||= 0; out.EURTRY_satis ||= 0;

  return out;
}

function parsePaid(arr) {
  if (!Array.isArray(arr)) throw new Error('Paid API format hatası');

  const map = {
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

  const out = {};
  for (const item of arr) {
    const code = map[item.key];
    if (!code) continue;

    const buy = parseFloat(String(item.buy).replace(/\./g, '').replace(',', '.')) || 0;
    const sell = parseFloat(String(item.sell).replace(/\./g, '').replace(',', '.')) || 0;

    out[`${code}_alis`] = buy;
    out[`${code}_satis`] = sell;
  }

  out.USDTRY_alis = 0; out.USDTRY_satis = 0;
  out.EURTRY_alis = 0; out.EURTRY_satis = 0;

  return out;
}

async function fetchFree() {
  const r = await axios.get(FREE_URL, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  return parseFree(r.data);
}

async function fetchPaid() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY env yok');

  const r = await axios.get(PAID_URL, {
    timeout: 5000,
    headers: {
      'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
      'x-rapidapi-key': key
    }
  });

  return parsePaid(r.data?.data);
}

async function getPrices() {
  const now = Date.now();

  // TTL dolmadıysa cache
  if (state.lastData && (now - state.lastAt) < state.lastTtlMs) {
    return {
      source: state.lastSource,
      data: state.lastData,
      cached: true,
      cacheAgeMs: now - state.lastAt,
      ttlMs: state.lastTtlMs
    };
  }

  // Free bozulduysa 60 sn free denemeyi azalt
  const canTryFree = (now - state.lastFreeFailAt) > 60000;

  if (canTryFree) {
    try {
      const data = await fetchFree();
      state.lastData = data;
      state.lastAt = now;
      state.lastSource = 'free';
      state.lastTtlMs = 15000; // 15sn
      return { source: 'free', data, cached: false, cacheAgeMs: 0, ttlMs: 15000 };
    } catch (e) {
      state.lastFreeFailAt = now;
    }
  }

  const data = await fetchPaid();
  state.lastData = data;
  state.lastAt = now;
  state.lastSource = 'paid';
  state.lastTtlMs = 30000; // 30sn
  return { source: 'paid', data, cached: false, cacheAgeMs: 0, ttlMs: 30000 };
}

module.exports = { getPrices };
