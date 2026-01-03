require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB bağlantısı başarılı'))
  .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/fiyat', require('./routes/fiyat'));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Catch-all route for serving static HTML files
app.get('*', (req, res, next) => {
  // API route'larını geçir
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  // HTML dosyalarını serve et
  const filePath = path.join(__dirname, 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      // Dosya yoksa 404
      res.status(404).json({ 
        success: false, 
        message: 'Sayfa bulunamadı: ' + req.path
      });
    }
  });
});

// Hata Handler
app.use((err, req, res, next) => {
  console.error('Server hatası:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 Kuyumcu Vitrin Mini`);
  console.log(`📺 Sunucu: http://localhost:${PORT}`);
  console.log(`⏰ Token Süresi: ${process.env.JWT_EXPIRES_IN}`);
  console.log('=================================');
});

// Vercel için export
module.exports = app;