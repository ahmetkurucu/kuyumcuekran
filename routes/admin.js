const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const PaidApiLog = require('../models/PaidApiLog');
const priceService = require('../services/priceService');

async function requireSuperAdmin(req, res, next) {
  await connectDB();
  const me = await User.findById(req.user.id);
  if (!me || me.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Sadece Super Admin' });
  }
  next();
}

// ✅ Fiyat kaynağı durumu (free mi paid mi)
router.get('/price-status', authenticateToken, requireSuperAdmin, async (req, res) => {
  return res.json({ success: true, data: priceService.getStatus() });
});

// ✅ Ücretli API istatistikleri (günlük + son N gün)
router.get('/paid-api/stats', authenticateToken, requireSuperAdmin, async (req, res) => {
  const days = Math.min(parseInt(req.query.days || '7', 10), 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const total = await PaidApiLog.countDocuments({ createdAt: { $gte: since } });

  // Bugün
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  const today = await PaidApiLog.countDocuments({ createdAt: { $gte: startOfToday } });

  // Top users
  const topUsers = await PaidApiLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$username', count: { $sum: 1 }, fail: { $sum: { $cond: ['$success', 0, 1] } } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Top IPs
  const topIps = await PaidApiLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$ip', count: { $sum: 1 }, fail: { $sum: { $cond: ['$success', 0, 1] } } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  return res.json({
    success: true,
    data: {
      days,
      today,
      total,
      topUsers,
      topIps
    }
  });
});

// ✅ Son ücretli çağrılar
router.get('/paid-api/logs', authenticateToken, requireSuperAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

  const logs = await PaidApiLog.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json({ success: true, data: logs });
});

module.exports = router;
