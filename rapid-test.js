require('dotenv').config();
const axios = require('axios');

(async () => {
  try {
    const r = await axios.get(
      'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
      {
        timeout: 8000,
        headers: {
          'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      }
    );

    const arr = r.data?.data || [];

    const pick = (needle) =>
      arr
        .filter(x => String(x.key || '').toLowerCase().includes(needle))
        .map(x => ({ key: x.key, buy: x.buy, sell: x.sell }))
        .slice(0, 20);

    console.log('CEYREK:', pick('çeyrek').concat(pick('ceyrek')));
    console.log('YARIM:', pick('yarım').concat(pick('yarim')));
    console.log('TAM:', pick('tam'));
    console.log('ATA:', pick('ata'));

    console.log('\n--- RAW KEYS SAMPLE ---');
    console.log(arr.map(x => x.key).slice(0, 40));
  } catch (e) {
    console.error('ERROR:', e.response?.status, e.message);
  }
})();
