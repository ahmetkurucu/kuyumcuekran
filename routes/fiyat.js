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
// ✅ ÜCRETSİZ API için: "3.245,12" -> 3245.12  (DOKUNMADIK)
function parseMoney(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;

  const s = String(v).trim();
  if (!s) return 0;

  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

// ✅ SADECE ÜCRETLİ API için: hem "3.245,12" hem "3,245.12" hem "3245.12"
function parseMoneyPaid(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;

  const s = String(v).trim();
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  // hem , hem . varsa son gelen ayırıcı decimal kabul edilir
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastDot > lastComma) {
      // "1,234.56" -> remove commas
      const x = s.replace(/,/g, '');
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : 0;
    } else {
      // "1.234,56" -> remove dots, comma -> dot
      const x = s.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : 0;
    }
  }

  // sadece virgül varsa
  if (hasComma && !hasDot) {
    const lastComma = s.lastIndexOf(',');
    const digitsAfter = s.length - lastComma - 1;
    // "1,234" gibi binlikse virgülü sil
    if (digitsAfter === 3) {
      const x = s.replace(/,/g, '');
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : 0;
    }
    // "1234,56" gibi decimal ise virgülü dot yap
    const x = s.replace(',', '.');
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : 0;
  }

  // sadece nokta varsa
  if (hasDot && !hasComma) {
    const lastDot = s.lastIndexOf('.');
    const digitsAfter = s.length - lastDot - 1;
    // "1.234" binlik olma ihtimali -> sil
    if (digitsAfter === 3 && s.length > 4) {
      const x = s.replace(/\./g, '');
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : 0;
    }
    // normal decimal
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  // düz sayı
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseFreeData(raw) {
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

// ✅ TCMB today.xml -> USD/EUR
async function fetchTcmRates() {
  const r = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 5000 });
  const xml = String(r.data || '');

  function pickCurrencyBlock(code) {
    const re = new RegExp(`<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?<\\/Currency>`, 'i');
    const m = xml.match(re);
    return m ? m[0] : '';
  }

  function pickTag(block, tag) {
    const re = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'i');
    const m = block.match(re);
    return m ? m[1] : null;
  }

  const usdBlock = pickCurrencyBlock('USD');
  const eurBlock = pickCurrencyBlock('EUR');

  const usdBuy = parseFloat(pickTag(usdBlock, 'ForexBuying') || '0') || 0;
  const usdSell = parseFloat(pickTag(usdBlock, 'ForexSelling') || '0') || 0;

  const eurBuy = parseFloat(pickTag(eurBlock, 'ForexBuying') || '0') || 0;
  const eurSell = parseFloat(pickTag(eurBlock, 'ForexSelling') || '0') || 0;

  return {
    USDTRY_alis: usdBuy,
    USDTRY_satis: usdSell,
    EURTRY_alis: eurBuy,
    EURTRY_satis: eurSell
  };
}

// ✅ ÜCRETLİ RapidAPI parse: KG ise grama çevir (÷1000)
function parseRapidAPIData(arr) {
  const out = {};

  const keyMapping = {
    'GRAM ALTIN': 'KULCEALTIN',
    'KÜLÇE ALTIN': 'KULCEALTIN',
    'KULCE ALTIN': 'KULCEALTIN',

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
    'HAS': 'ALTIN'
  };

  (arr || []).forEach((item) => {
    let kRaw = String(item?.key || '').toUpperCase().trim();
    if (!kRaw) return;

    // parantez içlerini temizle: "HAS ALTIN (KG)" -> "HAS ALTIN"
    const kNoParens = kRaw.replace(/\([^)]*\)/g, '').trim();

    // KG kontrolü (RapidAPI bazen KG fiyatı döndürüyor)
    const isKg =
      /\bKG\b/.test(kRaw) ||
      kRaw.includes('KILOGRAM') ||
      kRaw.includes('KİLOGRAM');

    const mapped = keyMapping[kNoParens] || keyMapping[kRaw];
    if (!mapped) return;

    const buy = parseMoneyPaid(item.buy);
    const sell = parseMoneyPaid(item.sell);

    // KG ise grama çevir
    const scale = isKg ? 1 / 1000 : 1;

    // Not: Aynı ürün hem KG hem normal gelirse; normal (gram) genelde daha doğru
    // Biz KG'yi de yazıyoruz ama sonra normal gelirse üstüne yazar.
    out[`${mapped}_alis`] = buy * scale;
    out[`${mapped}_satis`] = sell * scale;
  });

  // dövizler ücretli modda TCMB’den set edilecek (burada 0)
  out.USDTRY_alis = 0;
  out.USDTRY_satis = 0;
  out.EURTRY_alis = 0;
  out.EURTRY_satis = 0;

  return out;
}

async function fetchFromFreeAPI() {
  const r = await axios.get(API_CONFIG.FREE.url, {
    timeout: API_CONFIG.FREE.timeout,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!r.data || !r.data.data) throw new Error('Free API formatı bozuk');
  const normalized = parseFreeData(r.data.data);

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

  // ✅ ÜCRETLİ modda USD/EUR TCMB’den
  try {
    const fx = await fetchTcmRates();
    normalized.USDTRY_alis = fx.USDTRY_alis;
    normalized.USDTRY_satis = fx.USDTRY_satis;
    normalized.EURTRY_alis = fx.EURTRY_alis;
    normalized.EURTRY_satis = fx.EURTRY_satis;
  } catch (e) {
    // TCMB patlarsa, 0 bırak (sistemi düşürme)
  }

  if (!normalized.KULCEALTIN_satis || normalized.KULCEALTIN_satis === 0) {
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
// - Free çalışıyorsa realtime döner
// - Free yoksa Paid’e geçer:
//   Mongo cache 30 sn’den gençse onu döner,
//   30 sn’den eskiyse paid çekip cache günceller ve döner.
// -----------------------------------------------------
router.get('/current', authenticateToken, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // 1) FREE dene (DOKUNMADIK)
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
      // free patladı -> paid
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

    // paid’i mongo’ya kaydet
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
        refreshHint: '30sn',
        fxSource: 'TCMB'
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

module.exports = router;
