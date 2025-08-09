const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import routes
const paymentRoutes = require('./routes/payment');
const accountRoutes = require('./routes/account');
const withdrawalRoutes = require('./routes/withdrawal');
const directDepositRoutes = require('./routes/directDeposit');
const balanceRoutes = require('./routes/balance');
const transactionRoutes = require('./routes/transaction');

// Import services
const tokenService = require('./services/tokenService');
const accountService = require('./services/accountService');
const logger = require('./utils/logger');

// Middleware
const SecurityMiddleware = require('./middleware/security');
const rateLimiters = require('./middleware/rateLimiting');

const app = express();

// Security middleware
app.use(helmet());

// ✅ CORS setup FIRST so preflight is never blocked
app.use(cors({
  origin: function (origin, callback) {
    console.log("CORS request from:", origin); // Debugging

    if (!origin) return callback(null, true); // server-to-server

    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'https://afripayflow-frontend.vercel.app'
    ];

    const isVercelPreview = /https:\/\/.+\.vercel\.app$/.test(origin);

    if (allowedOrigins.includes(origin) || isVercelPreview) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ Handle preflight right after CORS
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api/', limiter);

// Security middleware
app.use(SecurityMiddleware.addSecurityHeaders);
app.use(SecurityMiddleware.validateRequestSize);
app.use(SecurityMiddleware.validateContentType);
app.use(SecurityMiddleware.sanitizeRequest);
app.use(SecurityMiddleware.logRequest);

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/direct-deposit', directDepositRoutes);
app.use('/api/v1/balances', balanceRoutes);
app.use('/api/v1/transactions', transactionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    project: 'AfriPayFlow'
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    project: 'AfriPayFlow',
    description: 'Gasless crypto payments for Africa with Hedera integration',
    version: '1.0.0'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
async function startServer() {
  try {
    logger.info('Starting AfriPayFlow backend server...');

    await tokenService.createMockTokens().catch(err => logger.warn(err.message));
    await accountService.createCustodialAccount('test_merchant').catch(err => logger.warn(err.message));
    await accountService.createCustodialAccount('test_customer').catch(err => logger.warn(err.message));

    if (process.env.NODE_ENV !== 'production') {
      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => {
        console.log(`AfriPayFlow server running on http://localhost:${PORT}`);
      });
    }
  } catch (error) {
    console.error('Failed to start AfriPayFlow server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
