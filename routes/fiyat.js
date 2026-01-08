const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const CachedPrice = require('../models/CachedPrice');

// ---------- API CONFIG ----------
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
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
    },
    name: 'ÜCRETLİ (RapidAPI)'
  }
};

// ---------- HELPERS ----------
function parseMoney(v) {
  // sayı gelirse direkt
  if (typeof v === 'number') return v;
  if (v == null) return 0;

  // string: "3.245,12" -> 3245.12
  const s = String(v).trim();
  if (!s) return 0;

  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseFreeData(raw) {
  // raw: response.data.data (object)
  const out = {};
  Object.keys(raw || {}).forEach((key) => {
    const item = raw[key];
    if (item && typeof item === 'object') {
      out[`${key}_alis`] = parseMoney(item.alis);
      out[`${key}_satis`] = parseMoney(item.satis);
    }
  });
  return out;
}

function parseRapidAPIData(arr) {
  // arr: response.data.data (array)
  const out = {};

  // KEY’leri uppercase eşleştir (RapidAPI bazen farklı yazıyor)
  const keyMapping = {
    'GRAM ALTIN': 'KULCEALTIN',
    'KÜLÇE ALTIN': 'KULCEALTIN',
    '22 AYAR': 'AYAR22',
    'YENİ ÇEYREK': 'CEYREK_YENI',
    'ESKİ ÇEYREK': 'CEYREK_ESKI',
    'YENI CEYREK': 'CEYREK_YENI',
    'ESKI CEYREK': 'CEYREK_ESKI',
    'YENİ YARIM': 'YARIM_YENI',
    'ESKİ YARIM': 'YARIM_ESKI',
    'YENI YARIM': 'YARIM_YENI',
    'ESKI YARIM': 'YARIM_ESKI',
    'YENİ TAM': 'TEK_YENI',
    'ESKİ TAM': 'TEK_ESKI',
    'YENI TAM': 'TEK_YENI',
    'ESKI TAM': 'TEK_ESKI',
    'YENİ ATA': 'ATA_YENI',
    'YENI ATA': 'ATA_YENI',
    'HAS ALTIN': 'ALTIN',
    'HAS ALTIN (TL)': 'ALTIN',
    'HAS': 'ALTIN'
  };

  (arr || []).forEach((item) => {
    const k = String(item?.key || '').toUpperCase().trim();
    const mapped = keyMapping[k];
    if (!mapped) return;

    const buy = parseMoney(item.buy);
    const sell = parseMoney(item.sell);

    out[`${mapped}_alis`] = buy;
    out[`${mapped}_satis`] = sell;
  });

  // döviz alanları yoksa 0 (istersen sonra eklersin)
  out.USDTRY_alis = out.USDTRY_alis || 0;
  out.USDTRY_satis = out.USDTRY_satis || 0;
  out.EURTRY_alis = out.EURTRY_alis || 0;
  out.EURTRY_satis = out.EURTRY_satis || 0;

  return out;
}

async function fetchFromFreeAPI() {
  const r = await axios.get(API_CONFIG.FREE.url, {
    timeout: API_CONFIG.FREE.timeout,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!r.data || !r.data.data) throw new Error('Free API formatı bozuk');
  const normalized = parseFreeData(r.data.data);

  // minimal doğrulama
  if (!normalized.KULCEALTIN_satis || normalized.KULCEALTIN_satis === 0) {
    throw new Error('Free API geçersiz fiyat döndürdü');
  }

  return normalized;
}

async function fetchFromPaidAPI() {
  const r = await axios.get(API_CONFIG.PAID.url, {
    timeout: API_CONFIG.PAID.timeout,
    headers: API_CONFIG.PAID.headers
  });

  if (!r.data || !r.data.data) throw new Error('Paid API veri döndürmedi');
  const normalized = parseRapidAPIData(r.data.data);

  // minimal doğrulama
  if (!normalized.KULCEALTIN_satis || normalized.KULCEALTIN_satis === 0) {
    // RapidAPI’den farklı key geliyorsa burada patlar
    throw new Error('Paid API parse edilemedi (key eşleşmedi)');
  }

  return normalized;
}

function applyMarj(user, basePrices) {
  const finalPrices = {};
  const marjlar = user?.marjlar || {};

  Object.keys(basePrices || {}).forEach((key) => {
    const parts = key.split('_');
    const type = parts[parts.length - 1]; // alis/satis
    const marjKey = `${key}_marj`;
    const marj = parseMoney(marjlar[marjKey]);

    if (type === 'alis') finalPrices[key] = parseMoney(basePrices[key]) - marj;
    else if (type === 'satis') finalPrices[key] = parseMoney(basePrices[key]) + marj;
    else finalPrices[key] = parseMoney(basePrices[key]);
  });

  return finalPrices;
}

// -----------------------------------------------------
// GET /api/fiyat/current
// - Free çalışıyorsa realtime döner (15 sn polling senin tarafta)
// - Free yoksa Paid’e geçer, ama RapidAPI’yi korumak için:
//   Mongo cache 30 sn’den gençse onu döner,
//   30 sn’den eskiyse paid çekip cache günceller ve döner.
// -----------------------------------------------------
router.get('/current', authenticateToken, async (req, res) => {
  // Vercel / tarayıcı cache’ini kır
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // 1) FREE dene (hızlı timeout)
    try {
      const freeData = await fetchFromFreeAPI();
      const finalPrices = applyMarj(user, freeData);

      return res.json({
        success: true,
        data: finalPrices,
        metadata: {
          source: 'free_api_realtime',
          sourceName: '🟢 Ücretsiz API (Realtime)',
          fetchedAt: new Date(),
          refreshHint: '15sn'
        }
      });
    } catch (e) {
      // free patladı -> paid’e düş
    }

    // 2) PAID modunda: önce cache kontrol et
    const latest = await CachedPrice.findOne().sort({ fetchedAt: -1 }).limit(1);

    if (latest) {
      const ageSec = Math.floor((Date.now() - new Date(latest.fetchedAt).getTime()) / 1000);
      if (ageSec < 30) {
        const finalPrices = applyMarj(user, latest.prices);
        return res.json({
          success: true,
          data: finalPrices,
          metadata: {
            source: latest.source || 'paid_api_cache',
            sourceName: '🟡 Ücretli API (Cache)',
            fetchedAt: latest.fetchedAt,
            cacheAge: ageSec,
            refreshHint: '30sn'
          }
        });
      }
    }

    // 3) Cache yok / eski -> paid çek
    const paidData = await fetchFromPaidAPI();

    // paid’i mongo’ya kaydet (marj yönetimi mongo zaten var)
    // fetchedBy schema required olduğu için kullanıcı id ile kaydediyoruz
    const doc = await CachedPrice.create({
      prices: paidData,
      fetchedBy: user._id,
      fetchedAt: new Date(),
      source: 'paid_api',
      lastApiStatus: {
        freeApiWorking: false,
        paidApiWorking: true,
        bothApiFailed: false,
        lastFailTime: null
      }
    });

    const finalPrices = applyMarj(user, paidData);

    return res.json({
      success: true,
      data: finalPrices,
      metadata: {
        source: 'paid_api',
        sourceName: '🟡 Ücretli API (Realtime)',
        fetchedAt: doc.fetchedAt,
        cacheAge: 0,
        refreshHint: '30sn'
      }
    });

  } catch (error) {
    console.error('Fiyat getirme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Fiyatlar alınırken hata oluştu',
      error: error.message
    });
  }
});

// Marj güncelleme / listeleme (senin mevcut mantık kalsın)
router.post('/update-marj', authenticateToken, async (req, res) => {
  try {
    const { code, alis_marj, satis_marj } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Ürün kodu gerekli' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    if (!user.marjlar) user.marjlar = {};

    user.marjlar[`${code}_alis_marj`] = parseMoney(alis_marj);
    user.marjlar[`${code}_satis_marj`] = parseMoney(satis_marj);

    user.markModified('marjlar');
    await user.save();

    res.json({ success: true, message: 'Marj başarıyla güncellendi', marjlar: user.marjlar });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Marj güncellenirken hata oluştu', error: e.message });
  }
});

router.get('/marjlar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    res.json({ success: true, data: user.marjlar || {} });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Marjlar alınamadı', error: e.message });
  }
});

module.exports = router;
