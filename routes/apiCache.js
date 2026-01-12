const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const priceService = require('../services/priceService');

// ✅ Cache durumu + son fiyat (DB yok)
router.get('/cached', authenticateToken, async (req, res) => {
  try {
    // fiyat + kaynak durumunu dön
    const result = await priceService.getPrices({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: 'GET /api/cache/cached'
    });

    return res.json({
      success: true,
      data: result.data,
      metadata: {
        source: result.source,
        cached: !!result.cached,
        stale: !!result.stale,
        status: result.status
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ✅ Superadmin “manuel yenile” (DB’ye yazmaz)
router.post('/fetch-from-api', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const me = await User.findById(req.user.id);
    if (!me || me.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Sadece Super Admin' });
    }

    const preferPaid = req.body?.source === 'paid';

    const result = await priceService.forceRefresh(
      { preferPaid },
      {
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        endpoint: 'POST /api/cache/fetch-from-api'
      }
    );

    return res.json({
      success: true,
      message: `Yenilendi: ${result.source}`,
      data: result.data,
      metadata: {
        source: result.source,
        status: result.status
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
