const axios = require('axios');

async function testRapidAPI() {
  try {
    console.log('🔄 RapidAPI test ediliyor...\n');
    
    const response = await axios.get(
      'https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices',
      {
        headers: {
          'x-rapidapi-host': 'harem-altin-live-gold-price-data.p.rapidapi.com',
          'x-rapidapi-key': '259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
        },
        timeout: 10000
      }
    );

    console.log('✅ Başarılı! Response:\n');
    console.log(JSON.stringify(response.data, null, 2));
    
    console.log('\n📊 Response yapısı:');
    console.log('typeof response.data:', typeof response.data);
    console.log('response.data keys:', Object.keys(response.data));
    
    if (response.data.data) {
      console.log('\nresponse.data.data keys:', Object.keys(response.data.data));
      console.log('\nÖrnek veriler:');
      console.log('KULCEALTIN_satis:', response.data.data.KULCEALTIN_satis);
      console.log('AYAR22_satis:', response.data.data.AYAR22_satis);
    }

  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testRapidAPI();
