const app = require('../server');

// Vercel serverless entry
module.exports = (req, res) => {
  return app(req, res);
};
