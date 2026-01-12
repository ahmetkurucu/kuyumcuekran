const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Kullanıcı adı ve şifre gerekli'
      });
    }

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı adı veya şifre hatalı'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı adı veya şifre hatalı'
      });
    }

    // ✅ ÖNEMLİ: id string olmalı (Mongoose ObjectId -> string)
    const token = jwt.sign(
      {
        id: user._id.toString(),
        username: user.username,
        full_name: user.full_name,
        role: user.role || 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    return res.json({
      success: true,
      message: 'Giriş başarılı',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        full_name: user.full_name,
        role: user.role || 'admin'
      }
    });

  } catch (error) {
    console.error('Login hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Giriş sırasında bir hata oluştu',
      error: error.message
    });
  }
});

// Şifre Değiştir
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Eski ve yeni şifre gerekli'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre en az 6 karakter olmalı'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Eski şifre hatalı'
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: 'Şifre başarıyla değiştirildi'
    });

  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Şifre değiştirme sırasında bir hata oluştu',
      error: error.message
    });
  }
});

// Kullanıcı kayıt (SADECE SUPERADMIN)
router.post('/register', authenticateToken, async (req, res) => {
  try {
    // Superadmin kontrolü
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok. Sadece Super Admin kullanıcı ekleyebilir.'
      });
    }

    const { username, full_name, password, role } = req.body;

    if (!username || !full_name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Tüm alanlar gerekli'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Şifre en az 6 karakter olmalı'
      });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı adı zaten kullanılıyor'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username: username.toLowerCase().trim(),
      password: hashedPassword,
      full_name: full_name.trim(),
      role: role || 'admin'
    });

    await newUser.save();

    return res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu',
      user: {
        id: newUser._id.toString(),
        username: newUser.username,
        full_name: newUser.full_name,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('Kullanıcı oluşturma hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcı oluşturulurken hata oluştu',
      error: error.message
    });
  }
});

// Kullanıcı listesi (SADECE SUPERADMIN)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const users = await User.find({}, 'username full_name role createdAt').sort({ createdAt: -1 });
    return res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Kullanıcı listesi hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcılar alınamadı',
      error: error.message
    });
  }
});

// Kullanıcı sil (SADECE SUPERADMIN)
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const userId = req.params.id;
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    return res.json({
      success: true,
      message: 'Kullanıcı silindi'
    });

  } catch (error) {
    console.error('Kullanıcı silme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcı silinemedi',
      error: error.message
    });
  }
});

module.exports = router;
