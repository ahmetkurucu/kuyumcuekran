const axios = require('axios');
const xml2js = require('xml2js');

async function testTCMB() {
  try {
    console.log('🔄 TCMB API test ediliyor...\n');
    
    const response = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', {
      timeout: 10000
    });
    
    console.log('✅ XML alındı!\n');
    
    // XML'i parse et
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    console.log('📊 Parse edildi!\n');
    
    // Currency array'ini kontrol et
    const currencies = result.Tarih_Date.Currency;
    
    // USD bul
    const usd = currencies.find(c => c.$.CurrencyCode === 'USD');
    const eur = currencies.find(c => c.$.CurrencyCode === 'EUR');
    
    console.log('USD Bilgisi:');
    console.log('  Kod:', usd.$.CurrencyCode);
    console.log('  Alış:', usd.ForexBuying?.[0]);
    console.log('  Satış:', usd.ForexSelling?.[0]);
    console.log('');
    
    console.log('EUR Bilgisi:');
    console.log('  Kod:', eur.$.CurrencyCode);
    console.log('  Alış:', eur.ForexBuying?.[0]);
    console.log('  Satış:', eur.ForexSelling?.[0]);
    console.log('');
    
    console.log('✅ TCMB API çalışıyor!');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
    }
  }
}

testTCMB();
