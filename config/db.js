const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  // Eğer zaten bağlantı varsa, onu kullan
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('✅ MongoDB - Cached connection kullanılıyor');
    return cachedConnection;
  }

  try {
    // Mongoose ayarları - Serverless için optimize
    const options = {
      bufferCommands: false, // Timeout'u önlemek için
      maxPoolSize: 10, // Connection pool
      serverSelectionTimeoutMS: 5000, // 5 saniye timeout
      socketTimeoutMS: 45000, // Socket timeout
      family: 4 // IPv4 kullan
    };

    // MongoDB bağlantısı
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    cachedConnection = conn;
    
    console.log('✅ MongoDB bağlantısı başarılı:', conn.connection.host);

    // Bağlantı hataları için listener
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB bağlantı hatası:', err);
      cachedConnection = null;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB bağlantısı koptu');
      cachedConnection = null;
    });

    return conn;

  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error.message);
    cachedConnection = null;
    throw error;
  }
};

module.exports = connectDB;
