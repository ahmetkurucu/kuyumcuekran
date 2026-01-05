const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("❌ MONGODB_URI tanımlı değil.");

let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null, listeners: false };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  if (!cached.promise) {
    mongoose.set("bufferCommands", false);
    mongoose.set("bufferTimeoutMS", 0);

    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      family: 4
    }).then((m) => m);
  }

  cached.conn = await cached.promise;

  if (!cached.listeners) {
    mongoose.connection.on("error", (err) => {
      console.error("❌ Mongo error:", err);
      cached.conn = null;
      cached.promise = null;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ Mongo disconnected");
      cached.conn = null;
      cached.promise = null;
    });

    cached.listeners = true;
  }

  return cached.conn;
}

module.exports = connectDB;
