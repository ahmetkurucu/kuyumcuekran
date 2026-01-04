const axios = require('axios');

async function testExchangeRateAPI() {
  console.log('🔄 Döviz Kuru API test ediliyor...\n');
  
  try {
    // USD/TRY testi - YENİ ENDPOINT
    console.log('1️⃣ USD/TRY test ediliyor...');
    const usdResponse = await axios.get(
      'https://exchange-rate-api4.p.rapidapi.com/latest/USD',
      {
        headers: {
          'x-rapidapi-host': 'exchange-rate-api4.p.rapidapi.com',
          'x-rapidapi-key': '259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
        },
        timeout: 10000
      }
    );
    
    console.log('USD Response:');
    console.log(JSON.stringify(usdResponse.data, null, 2));
    console.log('\n---\n');
    
    // EUR/TRY testi
    console.log('2️⃣ EUR/TRY test ediliyor...');
    const eurResponse = await axios.get(
      'https://exchange-rate-api4.p.rapidapi.com/latest/EUR',
      {
        headers: {
          'x-rapidapi-host': 'exchange-rate-api4.p.rapidapi.com',
          'x-rapidapi-key': '259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
        },
        timeout: 10000
      }
    );
    
    console.log('EUR Response:');
    console.log(JSON.stringify(eurResponse.data, null, 2));
    console.log('\n---\n');
    
    // Özet
    console.log('✅ Test başarılı!\n');
    console.log('📊 Değerler:');
    
    let usdTry = 'N/A';
    let eurTry = 'N/A';
    
    if (usdResponse.data.rates && usdResponse.data.rates.TRY) {
      usdTry = usdResponse.data.rates.TRY;
    } else if (usdResponse.data.TRY) {
      usdTry = usdResponse.data.TRY;
    }
    
    if (eurResponse.data.rates && eurResponse.data.rates.TRY) {
      eurTry = eurResponse.data.rates.TRY;
    } else if (eurResponse.data.TRY) {
      eurTry = eurResponse.data.TRY;
    }
    
    console.log(`USD/TRY: ${usdTry}`);
    console.log(`EUR/TRY: ${eurTry}`);
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testExchangeRateAPI();
