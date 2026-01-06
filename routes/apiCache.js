const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const connectDB = require('../config/db');
const User = require('../models/User');
const priceService = require('../services/priceService');
const ApiUsageLog = require('../models/ApiUsageLog');

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

// =====================================================
// 🔐 SUPER ADMIN - API kullanım takibi (Günlük / IP / Kullanıcı)
// =====================================================

function requireSuperAdmin(req, res) {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ success: false, message: 'Sadece Super Admin' });
    return false;
  }
  return true;
}

// Bugünün başlangıcı/sonu (TR saatine yakın olması için local time kullanıyoruz)
function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// Özet: bugün kaç free/paid çağrı, son paid çağrı bilgisi, son kaynak
router.get('/admin/usage-summary', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    if (!requireSuperAdmin(req, res)) return;

    const { start, end } = todayRange();

    const [paidToday, freeToday] = await Promise.all([
      ApiUsageLog.countDocuments({ source: 'paid_api', createdAt: { $gte: start, $lte: end }, success: true }),
      ApiUsageLog.countDocuments({ source: 'free_api', createdAt: { $gte: start, $lte: end }, success: true })
    ]);

    const lastPaid = await ApiUsageLog.findOne({ source: 'paid_api', success: true }).sort({ createdAt: -1 }).lean();
    const lastAny = await ApiUsageLog.findOne({ success: true }).sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      data: {
        paidToday,
        freeToday,
        lastSource: lastAny?.source || null,
        lastSourceAt: lastAny?.createdAt || null,
        lastPaidAt: lastPaid?.createdAt || null,
        lastPaidUser: lastPaid?.username || null,
        lastPaidIp: lastPaid?.ip || null
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Son çağrılar (varsayılan: paid_api, limit=50)
router.get('/admin/usage-logs', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    if (!requireSuperAdmin(req, res)) return;

    const source = (req.query.source || 'paid_api').toString();
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);

    const logs = await ApiUsageLog.find({ source })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, data: logs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Bugün en çok çağrı yapan IP'ler (varsayılan: paid_api)
router.get('/admin/top-ips', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    if (!requireSuperAdmin(req, res)) return;

    const source = (req.query.source || 'paid_api').toString();
    const { start, end } = todayRange();

    const top = await ApiUsageLog.aggregate([
      { $match: { source, createdAt: { $gte: start, $lte: end }, success: true, ip: { $ne: null } } },
      { $group: { _id: '$ip', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, ip: '$_id', count: 1 } }
    ]);

    return res.json({ success: true, data: top });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
