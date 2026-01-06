require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/fiyat', require('./routes/fiyat'));
app.use('/api/contact', require('./routes/contact'));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Catch-all (public)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const filePath = path.join(__dirname, 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ success: false, message: 'Sayfa bulunamadı: ' + req.path });
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server hatası:', err);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;

// ✅ Local çalıştırmada listen
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Local server running: http://localhost:${PORT}`));
}
