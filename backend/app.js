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
// Removed yellowcard and invoice modules
const withdrawalRoutes = require('./routes/withdrawal');
const directDepositRoutes = require('./routes/directDeposit');


const balanceRoutes = require('./routes/balance');
const transactionRoutes = require('./routes/transaction');

// Removed investment routes

// Import services for initialization
const tokenService = require('./services/tokenService');
const accountService = require('./services/accountService');
const logger = require('./utils/logger');

// Import middleware
const SecurityMiddleware = require('./middleware/security');
const rateLimiters = require('./middleware/rateLimiting');


const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Allow localhost during development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // Allow specific production origins
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
     'https://afripayflow-frontend.vercel.app'
    ];

    // Allow Vercel preview deployments (*.vercel.app)
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

// Handle preflight quickly
app.options('*', cors());

// Rate limiting - More lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs 
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

// Existing routes
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
    project: 'AfriPayFlow',
    features: {
      hederaIntegration: true,
      custodialAccounts: true,
       tokenSupport: false,
      balanceAPI: true,
      transactionAPI: true
    }
  });
});


app.get('/api', (req, res) => {
  res.json({
    project: 'AfriPayFlow',
    description: 'Gasless crypto payments for Africa with Hedera integration',
    version: '1.0.0',
    features: {
      custodialAccounts: 'Create and manage Hedera accounts for users',
      gaslessPayments: 'HBAR and HTS token transfers without user gas fees',
      invoiceTokenization: 'Convert invoices to NFTs on Hedera',
      realTimeBalances: 'Query account balances and token info',
      transactionHistory: 'Complete transaction tracking and analytics'
    },
    endpoints: {
      accounts: {
        'POST /api/accounts/create': 'Create custodial account',
        'GET /api/accounts/:walletAddress/balance': 'Get wallet balance',
        'GET /api/accounts/:walletAddress/transactions': 'Get wallet transaction history',
        'GET /api/accounts/:walletAddress/info': 'Get wallet info',
        'GET /api/accounts/custodial/:userId/balance': 'Get custodial account balance',
        'GET /api/accounts/custodial/:userId/transactions': 'Get custodial account transactions'
      },
      payments: {
        'POST /api/payments/generate-qr': 'Generate payment QR code',
        'POST /api/payments/process': 'Process payment transaction',
        'GET /api/payments/status/:nonce': 'Get payment status',
        'POST /api/payments/validate': 'Validate payment request',
        'GET /api/payments/history': 'List merchant payment requests (QR links)',
        'POST /api/payments/cancel/:nonce': 'Cancel a payment request'
      },
      // invoices removed
      
      balances: {
        'GET /api/v1/balances/:accountId': 'Get account HBAR and token balances',
        'GET /api/v1/balances/custodial/:userId': 'Get custodial account balances',
        'GET /api/v1/balances/token/:tokenId/info': 'Get token info using TokenInfoQuery',
        'GET /api/v1/balances/tokens/overview': 'Get system tokens overview (USDC/USDT)'
      },
      transactions: {
        'GET /api/v1/transactions/:accountId': 'Get account transaction history',
        'GET /api/v1/transactions/custodial/:userId': 'Get custodial account transactions',
        'GET /api/v1/transactions/details/:transactionId': 'Get specific transaction details',
        'GET /api/v1/transactions/payments/history': 'Get payment system transaction history',
        'GET /api/v1/transactions/stats/overview': 'Get transaction statistics'
      },
      // yellowcard removed
    },
    hederaFeatures: {
      tokenCreateTransaction: 'Creates mock USDC/USDT and invoice NFTs',
      tokenAssociateTransaction: 'Associates tokens with custodial accounts',
      tokenTransferTransaction: 'Executes HTS token payments',
      tokenInfoQuery: 'Retrieves token metadata and info',
      accountBalanceQuery: 'Gets real-time account balances'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableEndpoints: '/api',
    suggestion: 'Check /api for complete endpoint documentation'
  });
});

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Starting AfriPayFlow backend server...');
    
    // Initialize mock tokens
    logger.info('Initializing Hedera services...');
    try {
      await tokenService.createMockTokens();
      logger.info('Mock tokens (USDC/USDT) created successfully');
    } catch (error) {
      logger.warn('Failed to create mock tokens:', error.message);
    }
    
    // Create initial custodial accounts for testing
    logger.info('Creating initial custodial accounts...');
    
    // Create merchant account
    try {
      const merchantAccount = await accountService.createCustodialAccount('test_merchant');
      logger.info(`Created merchant custodial account: ${merchantAccount.accountId}`);
    } catch (error) {
      logger.warn('Failed to create merchant custodial account:', error.message);
    }
    
    // Create customer account
    try {
      const customerAccount = await accountService.createCustodialAccount('test_customer');
      logger.info(`Created customer custodial account: ${customerAccount.accountId}`);
    } catch (error) {
      logger.warn('Failed to create customer custodial account:', error.message);
    }
    
    // For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log('AfriPayFlow server running successfully!');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`API Docs: http://localhost:${PORT}/api`);
    console.log(`Health Check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}
  } catch (error) {
    console.error('Failed to start AfriPayFlow server:', error);
    process.exit(1);
  }
}

// Shutdown
process.on('SIGTERM', () => {
  console.log('AfriPayFlow server shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('AfriPayFlow server shutting down...');
  process.exit(0);
});

startServer();

module.exports = app;
