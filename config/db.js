const mongoose = require('mongoose');

let cached = global.__mongooseCache;
if (!cached) {
  cached = global.__mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) throw new Error('MONGODB_URI yok');

  // ✅ Buffering kapat (buffering timeout hatasını bitirir)
  mongoose.set('bufferCommands', false);

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const options = {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4
    };

    cached.promise = mongoose.connect(uri, options).then((m) => m);
  }

  cached.conn = await cached.promise;

  console.log('✅ MongoDB bağlandı:', mongoose.connection.host);
  return cached.conn;
}

module.exports = connectDB;
