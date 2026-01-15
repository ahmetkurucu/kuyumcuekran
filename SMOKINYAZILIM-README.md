# Kuyumcu Vitrin - Smokinyazilim API Entegrasyonu

## ✅ API Güncellendi!

**Eski API:** nosyapi (çalışmıyordu)
**Yeni API:** smokinyazilim (ÜCRETLİ - ÇALIŞIYOR ✅)

---

## 🔧 Kurulum

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. .env Dosyasını Kontrol Et

`.env` dosyasında şu değişkenler olmalı:

```env
MONGODB_URI=mongodb+srv://kuyumcusistemleri_db_user:Dadas.2525@kuyumcuvitrin.ygerudf.mongodb.net/kuyumcu_vitrin?retryWrites=true&w=majority
JWT_SECRET=kuyumcu_vitrin_secret_key_2024
JWT_EXPIRES_IN=12h
PORT=3000
NODE_ENV=production
RAPIDAPI_KEY=259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94
RAPIDAPI_DYNAMIC_ID=23b4c2fb31a242d1eebc0df9b9b65e5e
```

**ÖNEMLİ:**
- `RAPIDAPI_KEY`: RapidAPI API anahtarınız
- `RAPIDAPI_DYNAMIC_ID`: Her kullanıcıya özel ID (RapidAPI dashboard'dan alınır)

### 3. Uygulamayı Başlat

```bash
npm start
```

Uygulama `http://localhost:3000` adresinde çalışacak.

---

## 🔗 API Detayları

### Smokinyazilim API (Ücretli)

**API:** Harem Altın Live Gold Price Data
**Host:** harem-altin-live-gold-price-data.p.rapidapi.com
**Endpoint:** `/harem_altin/prices/{DYNAMIC_ID}`
**Full URL:** `https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices/23b4c2fb31a242d1eebc0df9b9b65e5e`

### Veri Formatı

API'den gelen yanıt:
```json
{
  "data": [
    {
      "key": "GRAM ALTIN",
      "buy": "3.456,78",
      "sell": "3.478,90"
    },
    {
      "key": "YENİ ÇEYREK",
      "buy": "10.234,56",
      "sell": "10.345,67"
    }
  ]
}
```

### Desteklenen Altın Türleri

- ✅ GRAM ALTIN
- ✅ YENİ ÇEYREK
- ✅ ESKİ ÇEYREK
- ✅ YENİ YARIM
- ✅ ESKİ YARIM
- ✅ YENİ TAM
- ✅ ESKİ TAM
- ✅ YENİ ATA
- ✅ ESKİ ATA
- ✅ Has Altın (ONS)
- ✅ 22 AYAR
- ✅ GÜMÜŞ

---

## 📝 Yapılan Değişiklikler

### services/priceService.js

1. **API Endpoint Güncellendi:**
   - Eski: `harem-altin-anlik-altin-fiyatlari-live-rates-gold.p.rapidapi.com`
   - Yeni: `harem-altin-live-gold-price-data.p.rapidapi.com`

2. **Dynamic ID Eklendi:**
   - Endpoint'e kullanıcıya özel ID eklendi
   - `.env` dosyasından `RAPIDAPI_DYNAMIC_ID` okunuyor

3. **Veri Parse Güncellendi:**
   - Fiyat formatı: Türk formatı (1.234,56) → Float'a çevriliyor
   - Key mapping: "GRAM ALTIN" → "KULCEALTIN" gibi

4. **Cache Sistemi:**
   - 30 saniye cache devam ediyor
   - Hata durumunda eski cache kullanılıyor

---

## 🧪 Test

API'nin çalışıp çalışmadığını test etmek için:

```bash
curl --request GET \
  --url https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices/23b4c2fb31a242d1eebc0df9b9b65e5e \
  --header 'x-rapidapi-host: harem-altin-live-gold-price-data.p.rapidapi.com' \
  --header 'x-rapidapi-key: 259f0873d6msha36e59f1e65788fp1bea3djsnfc4ba2a69c94'
```

Ya da tarayıcıda `SMOKINYAZILIM-WORKING-API-TEST.html` dosyasını açın.

---

## 🚨 Sorun Giderme

### 1. API 404 Hatası Veriyorsa

- `RAPIDAPI_DYNAMIC_ID` değerini kontrol edin
- RapidAPI dashboard'da endpoint'i kontrol edin
- API aboneliğinizin aktif olduğundan emin olun

### 2. API 403 Hatası Veriyorsa

- `RAPIDAPI_KEY` değerini kontrol edin
- API aboneliğinizin aktif olduğundan emin olun
- RapidAPI'de limit aşımı olmadığından emin olun

### 3. Fiyatlar Gelmiyor

- MongoDB bağlantısını kontrol edin
- Console'da hata loglarını kontrol edin
- `/api/fiyat` endpoint'ini tarayıcıda açıp hata mesajını görün

---

## 📊 Endpoints

### Frontend
- `/` - Ana sayfa (vitrin)
- `/login.html` - Giriş sayfası
- `/admin.html` - Admin paneli
- `/super-admin.html` - Süper admin paneli

### API
- `GET /api/fiyat` - Altın fiyatlarını getir
- `POST /api/auth/login` - Giriş yap
- `POST /api/auth/register` - Kayıt ol (sadece süper admin)
- `GET /api/admin/users` - Kullanıcı listesi

---

## 💰 Maliyet

Bu API **ÜCRETLİ** bir API'dir. RapidAPI'de:
- Free Plan: Aylık sınırlı istek
- Paid Plans: Daha fazla istek hakkı

Kullanım istatistiklerini RapidAPI dashboard'dan takip edebilirsiniz.

---

## 📞 Destek

Sorun yaşarsanız:
1. `.env` dosyasını kontrol edin
2. `npm install` yaptığınızdan emin olun
3. MongoDB bağlantısını test edin
4. API test sayfasını kullanarak API'yi test edin

---

## 🎉 Başarıyla Entegre Edildi!

Smokinyazilim API'si başarıyla entegre edildi ve test edildi. Artık canlı altın fiyatlarını uygulamanızda görebilirsiniz!
