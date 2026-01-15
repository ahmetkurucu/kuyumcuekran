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

  // Bugünkü başarılı/başarısız
  const todaySuccess = await PaidApiLog.countDocuments({ createdAt: { $gte: startOfToday }, success: true });
  const todayFail = await PaidApiLog.countDocuments({ createdAt: { $gte: startOfToday }, success: false });

  // Top users (son N gün)
  const topUsers = await PaidApiLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { 
      _id: '$username', 
      count: { $sum: 1 }, 
      success: { $sum: { $cond: ['$success', 1, 0] } },
      fail: { $sum: { $cond: ['$success', 0, 1] } } 
    }},
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Günlük kullanıcı bazlı detay (bugün)
  const todayByUser = await PaidApiLog.aggregate([
    { $match: { createdAt: { $gte: startOfToday } } },
    { $group: { 
      _id: { username: '$username', userId: '$userId' },
      count: { $sum: 1 },
      success: { $sum: { $cond: ['$success', 1, 0] } },
      fail: { $sum: { $cond: ['$success', 0, 1] } }
    }},
    { $sort: { count: -1 } }
  ]);

  // Top IPs (kullanıcı bilgisi dahil)
  const topIps = await PaidApiLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { 
      _id: { ip: '$ip', username: '$username' },
      count: { $sum: 1 }, 
      fail: { $sum: { $cond: ['$success', 0, 1] } } 
    }},
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  return res.json({
    success: true,
    data: {
      days,
      today,
      todaySuccess,
      todayFail,
      total,
      topUsers,
      todayByUser,
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

// ✅ Tüm kullanıcıları listele
router.get('/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    
    const users = await User.find({})
      .select('-password') // Şifreleri gösterme
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Kullanıcı sil
router.delete('/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    
    const userId = req.params.id;
    
    // Kendini silmeye çalışıyor mu?
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı silemezsiniz!' });
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    return res.json({ success: true, message: 'Kullanıcı silindi' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;