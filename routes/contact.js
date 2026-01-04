const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

// POST /api/contact - Yeni mesaj gönder (public)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, company, message } = req.body;

    // Validasyon
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'İsim, e-posta ve mesaj alanları zorunludur'
      });
    }

    // E-posta format kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir e-posta adresi giriniz'
      });
    }

    // Mesaj oluştur
    const contact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      message: message.trim()
    });

    await contact.save();

    res.json({
      success: true,
      message: 'Mesajınız başarıyla gönderildi! En kısa sürede size dönüş yapacağız.',
      data: {
        id: contact._id,
        createdAt: contact.createdAt
      }
    });

  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj gönderilemedi',
      error: error.message
    });
  }
});

// GET /api/contact - Tüm mesajları listele (Super Admin)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Sadece Super Admin erişebilir
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu sayfaya erişim yetkiniz yok'
      });
    }

    const { status, limit = 50, skip = 0 } = req.query;

    const query = status ? { status } : {};
    
    const messages = await Contact.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Contact.countDocuments(query);
    const newCount = await Contact.countDocuments({ status: 'new' });

    res.json({
      success: true,
      data: {
        messages,
        total,
        newCount,
        hasMore: total > (parseInt(skip) + parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Mesaj listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar listelenemedi',
      error: error.message
    });
  }
});

// PATCH /api/contact/:id/read - Mesajı okundu olarak işaretle
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'read',
        readAt: new Date()
      },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Mesaj okundu olarak işaretlendi',
      data: contact
    });

  } catch (error) {
    console.error('Mesaj güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj güncellenemedi'
    });
  }
});

// DELETE /api/contact/:id - Mesajı sil
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Mesaj silindi'
    });

  } catch (error) {
    console.error('Mesaj silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj silinemedi'
    });
  }
});

module.exports = router;
