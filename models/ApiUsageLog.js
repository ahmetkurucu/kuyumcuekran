const mongoose = require('mongoose');

const apiUsageLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ['free_api', 'paid_api'],
      required: true
    },
    endpoint: { type: String, default: '' }, // örn: /api/cache/fetch-from-api
    action: { type: String, default: '' },   // örn: manual_fetch, fallback_paid
    success: { type: Boolean, default: true },
    statusCode: { type: Number, default: 200 },
    latencyMs: { type: Number, default: 0 },

    // Kim yaptı?
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String, default: '' },
    full_name: { type: String, default: '' },

    // Nereden yaptı?
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    // Hata varsa
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

apiUsageLogSchema.index({ createdAt: -1 });
apiUsageLogSchema.index({ source: 1, createdAt: -1 });
apiUsageLogSchema.index({ userId: 1, createdAt: -1 });
apiUsageLogSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model('ApiUsageLog', apiUsageLogSchema);
