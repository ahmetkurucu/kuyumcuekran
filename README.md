# 🎯 KUYUMCU VİTRİN MİNİ

**Basit Kuyumcu Vitrin Uygulaması**

Sadece **Marj Ayarları** ve **Vitrin** olan mini versiyon.  
Diğer kuyumcular için ideal!

---

## ✨ Özellikler

✅ **Marj Sistemi:** Her kullanıcı kendi marjını girer  
✅ **Canlı Fiyatlar:** HaremAltın API'den çekilir  
✅ **12 Saatlik Oturum:** Token 12 saat geçerli  
✅ **Basit:** Sadece 2 sayfa (Admin + Vitrin)  
❌ **Stok Yok:** Stok takibi yok  
❌ **Sarrafiye Yok:** Alım/satım yok  
❌ **Cari Yok:** Hesap takibi yok  

---

## 📋 İçindekiler

```
kuyumcu-vitrin-mini/
├── server.js           # Ana sunucu
├── package.json        # Bağımlılıklar
├── .env               # Ayarlar
├── models/
│   └── User.js        # Kullanıcı modeli
├── routes/
│   ├── auth.js        # Login/Şifre değiştir
│   └── fiyat.js       # Fiyat & Marj
├── middleware/
│   └── auth.js        # Token kontrolü
└── public/
    ├── login.html     # Giriş sayfası
    ├── admin.html     # Marj ayarları
    └── vitrin.html    # Fiyat gösterimi
```

---

## 🚀 Kurulum

### 1️⃣ Dosyaları Aç
```bash
tar -xzf kuyumcu-vitrin-mini.tar.gz
cd kuyumcu-vitrin-mini
```

### 2️⃣ Bağımlılıkları Yükle
```bash
npm install
```

### 3️⃣ MongoDB'yi Başlat
```bash
# Windows:
net start MongoDB

# Linux/Mac:
sudo systemctl start mongod
```

### 4️⃣ İlk Kullanıcıyı Oluştur
```bash
node create-user.js
```

Sorular:
- Kullanıcı adı: `admin`
- Şifre: `123456`
- Tam ad: `Mehmet Kuyumcu`

### 5️⃣ Sunucuyu Başlat
```bash
npm start
```

Çıktı:
```
=================================
🚀 Kuyumcu Vitrin Mini
📺 Sunucu: http://localhost:3000
⏰ Token Süresi: 12h
=================================
✅ MongoDB bağlantısı başarılı
```

### 6️⃣ Tarayıcıda Aç
```
http://localhost:3000
```

---

## 📖 Kullanım

### 1️⃣ Giriş Yap
```
Kullanıcı adı: admin
Şifre: 123456
```

### 2️⃣ Marjları Ayarla
```
Admin Panel → Ürün Seç → Marj Gir → Kaydet
```

Örnek:
```
Gram Altın:
- Alış Marjı: -50₺ (API'den çıkar)
- Satış Marjı: +100₺ (API'ye ekle)
```

### 3️⃣ Vitrini Aç
```
Vitrin butonuna tıkla
veya
http://localhost:3000/vitrin.html
```

---

## 🎨 Ekran Görüntüleri

### Admin Panel
```
┌──────────────────────────────┐
│  Kuyumcu Vitrin Mini         │
│  Marj Ayarları               │
├──────────────────────────────┤
│ Ürün: [Gram Altın ▼]         │
│ Alış Marjı: [-50]            │
│ Satış Marjı: [+100]          │
│ [Kaydet]                     │
└──────────────────────────────┘
```

### Vitrin
```
┌──────────────────────────────┐
│  MEHMET KUYUMCU              │
│  Canlı Altın Fiyatları       │
├──────────────────────────────┤
│ Gram Altın  | 5617₺ | 5833₺  │
│ Çeyrek      | 4520₺ | 4680₺  │
│ Yarım       | 8950₺ | 9200₺  │
│ Tam         |17800₺ |18300₺  │
└──────────────────────────────┘
```

---

## ⚙️ Ayarlar (.env)

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/kuyumcu_vitrin

# JWT
JWT_SECRET=kuyumcu_vitrin_secret_key_2024
JWT_EXPIRES_IN=12h

# Port
PORT=3000
```

---

## 🔐 Güvenlik

- ✅ Şifreler bcrypt ile hash'lenir
- ✅ JWT token ile kimlik doğrulama
- ✅ 12 saatlik oturum süresi
- ✅ CORS koruması

---

## 📱 Farklı Cihazlardan Erişim

### Bilgisayar
```
http://localhost:3000
```

### Telefon/Tablet (Aynı ağda)
```
http://192.168.1.X:3000
(X = Bilgisayarın IP'si)
```

### TV (Aynı ağda)
```
http://192.168.1.X:3000/vitrin.html
```

---

## 🛠️ Sorun Giderme

### MongoDB Bağlanamıyor
```bash
# MongoDB çalışıyor mu?
mongo --eval "db.version()"

# Çalışmıyorsa:
net start MongoDB
```

### Port Kullanımda
```bash
# .env dosyasında portu değiştir:
PORT=3001
```

### Şifreyi Unuttum
```bash
# Yeni kullanıcı oluştur:
node create-user.js
```

---

## 📞 Destek

Sorularınız için:
- Email: destek@example.com
- Telefon: 0555 123 4567

---

## 📄 Lisans

MIT License - Ticari kullanım serbesttir.

---

## 🎉 Başarılar Dileriz!

**Kolay Gelsin!** 💎
