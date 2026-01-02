require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const User = require('./models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB bağlantısı başarılı\n');

    const username = await question('Kullanıcı adı: ');
    const password = await question('Şifre: ');
    const fullName = await question('Tam adı: ');

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username: username.toLowerCase().trim(),
      password: hashedPassword,
      full_name: fullName.trim()
    });

    await user.save();

    console.log('\n✅ Kullanıcı oluşturuldu!');
    console.log(`Kullanıcı adı: ${user.username}`);
    console.log(`Tam adı: ${user.full_name}`);

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    rl.close();
    mongoose.disconnect();
  }
}

createUser();
