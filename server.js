require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cache', require('./routes/apiCache'));
app.use('/api/fiyat', require('./routes/fiyat'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/admin', require('./routes/admin')); // ✅ yeni

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const filePath = path.join(__dirname, 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ success: false, message: 'Sayfa bulunamadı: ' + req.path });
  });
});

app.use((err, req, res, next) => {
  console.error('Server hatası:', err);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;

// ✅ LOCAL çalıştırmada DB + listen
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDB()
    .then(() => {
      app.listen(PORT, () => console.log(`✅ Local server running: http://localhost:${PORT}`));
    })
    .catch(err => {
      console.error('❌ MongoDB bağlantı hatası:', err.message);
      process.exit(1);
    });
}
