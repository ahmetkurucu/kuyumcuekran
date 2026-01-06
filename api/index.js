const app = require('../server');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  try {
    // DB gereken endpointler için bağlantıyı hazırla
    await connectDB();
    return app(req, res);
  } catch (e) {
    console.error('DB init error:', e.message);
    return res.status(500).json({ success: false, message: 'DB bağlantı hatası' });
  }
};