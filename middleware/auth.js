const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token bulunamadı'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Geçersiz token'
      });
    }

    // ✅ id normalize: bazı tokenlarda _id gelebilir, bazıları object olabilir
    const id = payload?.id || payload?._id;

    if (!id || typeof id !== 'string') {
      return res.status(401).json({
        success: false,
        message: 'Token içinde kullanıcı id yok / hatalı'
      });
    }

    req.user = { ...payload, id };
    next();
  });
}

module.exports = { authenticateToken };
