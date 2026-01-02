require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB bağlantısı başarılı\n');

    // Superadmin var mı kontrol et
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    
    if (existingSuperAdmin) {
      console.log('⚠️  Superadmin zaten mevcut:');
      console.log(`   Kullanıcı adı: ${existingSuperAdmin.username}`);
      console.log(`   Mağaza adı: ${existingSuperAdmin.full_name}`);
      console.log('\n💡 Varolan superadmin ile giriş yapabilirsiniz.');
      return;
    }

    // Yeni superadmin oluştur
    const username = 'superadmin';
    const password = 'Super123';
    const fullName = 'Super Admin';

    const hashedPassword = await bcrypt.hash(password, 10);

    const superAdmin = new User({
      username: username.toLowerCase(),
      password: hashedPassword,
      full_name: fullName,
      role: 'superadmin'
    });

    await superAdmin.save();

    console.log('✅ Super Admin kullanıcısı oluşturuldu!');
    console.log('\n📋 GİRİŞ BİLGİLERİ:');
    console.log('================================');
    console.log(`Kullanıcı adı: ${username}`);
    console.log(`Şifre: ${password}`);
    console.log(`Rol: Super Admin`);
    console.log('================================');
    console.log('\n🔐 Bu bilgileri güvenli bir yerde saklayın!');
    console.log('💡 Super Admin paneline /super-admin.html adresinden erişebilirsiniz.');

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

createSuperAdmin();
