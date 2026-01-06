const mongoose = require('mongoose');

const paidApiLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username: { type: String, default: null },
  role: { type: String, default: null },

  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  endpoint: { type: String, default: null },

  success: { type: Boolean, default: true },
  responseTimeMs: { type: Number, default: null },
  errorMessage: { type: String, default: null }
}, { timestamps: true });

paidApiLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaidApiLog', paidApiLogSchema);
