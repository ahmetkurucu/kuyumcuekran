# 💎 Kuyumcu Vitrin Sistemi

Modern ve basit kuyumcu vitrin yönetim sistemi.

## ✨ Özellikler

- 📊 Marj Yönetimi
- 📺 Canlı Vitrin Ekranı
- 🔐 Rollü Kullanıcı Sistemi
- ☁️ MongoDB Atlas (Cloud Database)
- 🌐 Vercel Deploy Ready

## 🚀 Kurulum

```bash
npm install
npm start
```

## 🔧 Ortam Değişkenleri

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=12h
PORT=3000
```

## 📖 Kullanım

1. Super Admin oluştur: `node create-superadmin.js`
2. Giriş yap: `/login.html`
3. Marjları ayarla: `/admin.html`
4. Vitrini aç: `/vitrin.html`

## 📄 Lisans

MIT
