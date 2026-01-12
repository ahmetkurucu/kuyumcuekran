require('dotenv').config();
const axios = require('axios');

const FREE_URL = 'https://canlipiyasalar.haremaltin.com/tmp/altin.json';
const PAID_URL = 'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices';

const PAID_HEADERS = {
  'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY || 'PUT_YOUR_KEY_HERE'
};

const expected = [
  'ALTIN_alis','ALTIN_satis',
  'KULCEALTIN_alis','KULCEALTIN_satis',
  'AYAR22_alis','AYAR22_satis',
  'CEYREK_YENI_alis','CEYREK_YENI_satis',
  'CEYREK_ESKI_alis','CEYREK_ESKI_satis',
  'YARIM_YENI_alis','YARIM_YENI_satis',
  'YARIM_ESKI_alis','YARIM_ESKI_satis',
  'TEK_YENI_alis','TEK_YENI_satis',
  'TEK_ESKI_alis','TEK_ESKI_satis',
  'ATA_YENI_alis','ATA_YENI_satis',
  'USDTRY_alis','USDTRY_satis',
  'EURTRY_alis','EURTRY_satis'
];

function parseMoney(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  let s = String(v).trim().replace(/\s/g,'');
  if (!s) return 0;

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) s = s.replace(/\./g,'').replace(',','.');
  else if (commaCount > 0 && dotCount === 0) s = s.replace(',','.');
  else if (commaCount === 0 && dotCount > 1) s = s.replace(/\./g,'');

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseFreeData(rawData) {
  const out = {};
  Object.keys(rawData || {}).forEach((k) => {
    const it = rawData[k];
    if (it && typeof it === 'object') {
      out[`${k}_alis`] = parseMoney(it.alis);
      out[`${k}_satis`] = parseMoney(it.satis);
    }
  });
  return out;
}

function normalizeKeyTR(s) {
  return String(s || '').toUpperCase().trim()
    .replace(/İ/g,'I').replace(/İ/g,'I')
    .replace(/Ş/g,'S').replace(/Ğ/g,'G')
    .replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C');
}

function parsePaidData(arr) {
  const out = {};
  const keyMapping = {
    'GRAM ALTIN': 'KULCEALTIN',
    'KULCE ALTIN': 'KULCEALTIN',
    'KULCE ALTIN (GRAM)': 'KULCEALTIN',
    '22 AYAR': 'AYAR22',
    'HAS ALTIN': 'ALTIN',
    'YENI CEYREK': 'CEYREK_YENI',
    'ESKI CEYREK': 'CEYREK_ESKI',
    'YENI YARIM': 'YARIM_YENI',
    'ESKI YARIM': 'YARIM_ESKI',
    'YENI TAM': 'TEK_YENI',
    'ESKI TAM': 'TEK_ESKI',
    'YENI ATA': 'ATA_YENI'
  };

  (arr || []).forEach((item) => {
    const rawKey = item?.key;
    const k = normalizeKeyTR(rawKey);
    const kNoParens = k.replace(/\([^)]*\)/g,'').trim();

    const code = keyMapping[kNoParens] || keyMapping[k];
    if (!code) return;

    const isKg = /\bKG\b/.test(k) || k.includes('KILOGRAM') || k.includes('KİLOGRAM');
    const scale = isKg ? 1/1000 : 1;

    out[`${code}_alis`] = parseMoney(item.buy) * scale;
    out[`${code}_satis`] = parseMoney(item.sell) * scale;
  });

  return out;
}

function missing(obj) {
  return expected.filter(k => !obj || obj[k] == null || obj[k] === 0);
}

async function main() {
  console.log('--- FREE API ---');
  try {
    const r = await axios.get(FREE_URL, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const raw = r.data?.data;
    const parsed = parseFreeData(raw);

    // sadece beklenenleri göster
    const picked = {};
    expected.forEach(k => picked[k] = parsed[k] || 0);

    console.log('missing:', missing(picked));
    console.log('sample:', {
      KULCEALTIN_satis: picked.KULCEALTIN_satis,
      ALTIN_satis: picked.ALTIN_satis,
      AYAR22_satis: picked.AYAR22_satis,
      USDTRY_satis: picked.USDTRY_satis,
      EURTRY_satis: picked.EURTRY_satis
    });
  } catch (e) {
    console.log('FREE ERROR:', e.message);
  }

  console.log('\n--- PAID API (RapidAPI) ---');
  try {
    const r = await axios.get(PAID_URL, { timeout: 5000, headers: PAID_HEADERS });
    const arr = r.data?.data;
    const parsed = parsePaidData(arr);

    console.log('missing:', missing(parsed));
    console.log('sample:', {
      KULCEALTIN_satis: parsed.KULCEALTIN_satis,
      ALTIN_satis: parsed.ALTIN_satis,
      AYAR22_satis: parsed.AYAR22_satis
    });

    // mapping dışında kalan key'leri görelim
    const keys = (arr || []).map(x => x?.key).filter(Boolean);
    console.log('\nPAID raw keys (first 30):');
    console.log(keys.slice(0,30));
  } catch (e) {
    console.log('PAID ERROR:', e.message);
  }
}

main();
