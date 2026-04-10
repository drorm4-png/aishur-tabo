const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Import modules
const db = require('./database');
const { municipalities, getMunicipalityById, searchMunicipalities } = require('./municipalities');
// Lazy-load automation (requires Playwright which may not be installed in all environments)
let processOrder;
try {
  ({ processOrder } = require('./automation'));
} catch (e) {
  console.warn('⚠️  Automation module not loaded (Playwright not installed). Automation features disabled.');
  processOrder = async () => ({ success: false, error: 'Automation not available - install Playwright' });
}
const { generatePOA, generatePOAToFile } = require('./poa-generator');
const { router: smsRouter } = require('./sms-webhook');
const { processPayment, createPaymentPage, handleWebhook: handlePaymentWebhook, processRefund, calculateTotal } = require('./payment');

// Import new modules built by teams
const { router: whatsappRouter, sendWhatsAppMessage, normalizePhoneNumber } = require('./whatsapp-handler');
const { sendNotification, getNotificationHistory, getNotificationStats, NOTIFICATION_TYPES, CHANNELS } = require('./notifications');
const { startPipeline, retryStep, getPipelineStatus, markPOAAsReceived, markSubmissionAsCompleted, PIPELINE_STEPS, ORDER_STATUSES } = require('./pipeline');
const { generatePaymentReceiptPDF, generatePaymentReceiptHTML } = require('./payment-receipt');

// Import monitoring and logging modules
const monitoring = require('./monitoring');
const { logger, requestLogger, errorLoggingMiddleware } = require('./logger');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create required directories
const requiredDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'data'),
  path.join(__dirname, 'public')
];

requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Setup process-level error handlers
monitoring.setupProcessErrorHandlers();

// Logging and monitoring middleware
app.use(requestLogger());
app.use(monitoring.monitoringMiddleware());

// Security middleware
app.use(helmet());
app.use(cors());

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    // Accept common document types
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents are allowed.'));
    }
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true
});

app.use('/api/', limiter);
app.use('/api/orders', apiLimiter);

// ============ Helper Functions ============

/**
 * Initialize database on startup (async for sql.js)
 */
async function initializeDatabase() {
  try {
    await db.migrate();
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

/**
 * Generate unique order ID
 */
function generateOrderId() {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

/**
 * Validate required fields in order
 */
function validateOrderData(data) {
  const required = [
    'municipality',
    'transactionType',
    'sellerName',
    'sellerId',
    'buyerName',
    'buyerId',
    'phone',
    'email',
    'propertyAddress',
    'block',
    'parcel'
  ];

  const errors = [];
  for (const field of required) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailRegex.test(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate phone format (basic Israeli format)
  const phoneRegex = /^(\+?972|0)?[1-9]\d{1,2}-?\d{3}-?\d{4}$/;
  if (data.phone && !phoneRegex.test(data.phone.replace(/\s/g, ''))) {
    errors.push('Invalid phone format');
  }

  return errors;
}

/**
 * Check admin authorization
 */
function isAdmin(req) {
  const adminPassword = req.headers['x-admin-password'] || req.query.adminPassword;
  return adminPassword === process.env.ADMIN_PASSWORD;
}

// ============ API Endpoints ============

// Health check endpoint with detailed monitoring
app.get('/health', (req, res) => {
  try {
    const health = monitoring.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    logger.error('Health check failed', { error: err.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Metrics endpoint (admin only)
app.get('/api/admin/metrics', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const metrics = monitoring.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (err) {
    logger.error('Metrics endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

// ============ Municipalities Endpoints ============

/**
 * GET /api/municipalities
 * List all municipalities with optional search
 */
app.get('/api/municipalities', (req, res) => {
  try {
    const { search } = req.query;

    let result = municipalities;
    if (search) {
      result = searchMunicipalities(search);
    }

    res.json({
      success: true,
      data: result,
      count: result.length
    });
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch municipalities' });
  }
});

/**
 * GET /api/municipalities/:id
 * Get municipality by ID
 */
app.get('/api/municipalities/:id', (req, res) => {
  try {
    const municipality = getMunicipalityById(req.params.id);

    if (!municipality) {
      return res.status(404).json({ success: false, error: 'Municipality not found' });
    }

    res.json({ success: true, data: municipality });
  } catch (err) {
    console.error('Error fetching municipality:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch municipality' });
  }
});

// ============ Orders Endpoints ============

/**
 * POST /api/orders
 * Create new order
 */
app.post('/api/orders', async (req, res) => {
  try {
    // Validate input
    const errors = validateOrderData(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Verify municipality exists (accept ID or name)
    let municipality = getMunicipalityById(req.body.municipality);
    if (!municipality) {
      // Try searching by name
      const found = searchMunicipalities(req.body.municipality);
      municipality = found.length > 0 ? found[0] : null;
    }
    if (!municipality) {
      return res.status(400).json({
        success: false,
        error: 'Municipality not found'
      });
    }

    // Create new order
    const orderId = generateOrderId();
    const newOrder = db.createOrder({
      id: orderId,
      client_name: req.body.sellerName,
      client_email: req.body.email,
      client_phone: req.body.phone,
      client_id_number: req.body.sellerId,
      property_address: req.body.propertyAddress,
      parcel_number: req.body.parcel,
      block_number: req.body.block,
      municipality_code: req.body.municipality,
      status: 'new',
      payment_status: 'pending',
      notes: req.body.notes || '',
      seller_name: req.body.sellerName,
      seller_id: req.body.sellerId,
      buyer_name: req.body.buyerName,
      buyer_id: req.body.buyerId,
      transaction_type: req.body.transactionType,
      signature_data: req.body.signatureData || null,
      terms_accepted: req.body.termsAccepted || false,
      signed_at: req.body.signedAt || null,
      documents: req.body.files || []
    });

    // Log audit entry
    db.logAudit(orderId, 'order_created', {
      client_email: req.body.email,
      municipality: req.body.municipality
    });

    // Generate POA PDF automatically (with digital signature if available)
    try {
      const poaPath = path.join(__dirname, 'uploads', `poa-${orderId}.pdf`);
      await generatePOAToFile({
        sellerName: req.body.sellerName,
        sellerId: req.body.sellerId,
        buyerName: req.body.buyerName,
        buyerId: req.body.buyerId,
        municipality: req.body.municipality,
        block: req.body.block,
        parcel: req.body.parcel,
        propertyAddress: req.body.propertyAddress,
        transactionType: req.body.transactionType,
        signatureData: req.body.signatureData,
        signedAt: req.body.signedAt
      }, poaPath);
      console.log(`POA generated for order ${orderId}: ${poaPath}`);
    } catch (poaErr) {
      console.error('Failed to generate POA:', poaErr.message);
      // Non-blocking: order still created even if POA generation fails
    }

    console.log('New order created:', orderId);

    // Trigger pipeline for the new order (async, non-blocking)
    try {
      startPipeline(orderId).catch(err => {
        console.error('Error starting pipeline for order:', orderId, err);
      });
    } catch (pipelineErr) {
      console.warn('Failed to start pipeline:', pipelineErr.message);
      // Non-blocking: order still created even if pipeline start fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: newOrder
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: err.message
    });
  }
});

/**
 * GET /api/orders/:id
 * Get order by ID
 */
app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

/**
 * GET /api/orders?phone=XXX
 * Get orders by phone number or list all (with admin check)
 */
app.get('/api/orders', (req, res) => {
  try {
    const { phone } = req.query;

    if (phone) {
      // Search by phone
      const filtered = db.getOrdersByPhone(phone);
      return res.json({
        success: true,
        data: filtered,
        count: filtered.length
      });
    }

    // If no phone query and not admin, return error
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required to list all orders'
      });
    }

    // Admin: return all orders with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = db.getAllOrders(page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

/**
 * PUT /api/orders/:id/status
 * Update order status (admin only)
 */
app.put('/api/orders/:id/status', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { status, notes } = req.body;
    const validStatuses = ['new', 'paid', 'processing', 'submitted', 'completed', 'failed', 'rejected', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = db.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const updatedOrder = db.updateOrderStatus(req.params.id, status, notes);

    // Log audit entry
    db.logAudit(req.params.id, 'status_changed', {
      oldStatus: order.status,
      newStatus: status,
      notes: notes
    });

    res.json({
      success: true,
      message: 'Order status updated',
      data: updatedOrder
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

// ============ File Upload Endpoints ============

/**
 * POST /api/upload
 * Upload documents
 */
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      url: `${process.env.BASE_URL || 'http://localhost:' + PORT}/api/uploads/${req.file.filename}`
    };

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: fileInfo
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload file'
    });
  }
});

/**
 * POST /api/payment/receipt
 * Generate payment receipt PDF
 */
app.post('/api/payment/receipt', async (req, res) => {
  try {
    const { orderId, amount, customerName, customerEmail, customerPhone, subtotal, serviceFee, vat } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'orderId and amount are required'
      });
    }

    // Generate receipt PDF
    const pdfBuffer = await generatePaymentReceiptPDF({
      orderId,
      amount,
      customerName: customerName || 'N/A',
      customerEmail: customerEmail || 'N/A',
      customerPhone: customerPhone || 'N/A',
      subtotal: subtotal || 0,
      serviceFee: serviceFee || 350,
      vat: vat || 0
    });

    // Send as downloadable PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${orderId}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating payment receipt:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate payment receipt'
    });
  }
});

/**
 * GET /api/uploads/:filename
 * Serve uploaded files
 */
app.get('/api/uploads/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const filepath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.download(filepath);
  } catch (err) {
    console.error('Error serving file:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    });
  }
});

// ============ POA Endpoints ============

/**
 * POST /api/poa/generate
 * Generate POA PDF from order data
 */
app.post('/api/poa/generate', (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    // Load order
    const order = db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Generate POA
    const poaPath = path.join(__dirname, 'uploads', `POA-${orderId}.pdf`);
    generatePOAToFile(order, poaPath);

    const downloadUrl = `${process.env.BASE_URL || 'http://localhost:' + PORT}/api/uploads/POA-${orderId}.pdf`;

    res.json({
      success: true,
      message: 'POA generated successfully',
      data: {
        filename: `POA-${orderId}.pdf`,
        downloadUrl
      }
    });
  } catch (err) {
    console.error('Error generating POA:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate POA',
      message: err.message
    });
  }
});

// ============ Payment Endpoints ============

/**
 * POST /api/payment/create-page
 * Create a hosted payment page (Tranzila iframe URL)
 * This is the primary payment flow - card details never touch our server
 */
app.post('/api/payment/create-page', async (req, res) => {
  try {
    const { orderId, amount, customerEmail, customerName, customerPhone } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'orderId and amount are required'
      });
    }

    // Verify order exists
    const order = db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Build webhook URL for Tranzila to notify us on payment
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const notifyUrl = `${baseUrl}/api/payment/webhook/tranzila`;
    const successUrl = `${baseUrl}/payment-success.html?order=${orderId}`;

    const result = await createPaymentPage({
      orderId,
      amount,
      customerEmail: customerEmail || order.client_email,
      customerName: customerName || order.client_name,
      customerPhone: customerPhone || order.client_phone,
      notifyUrl,
      successUrl,
      description: `אישור עירייה לטאבו - הזמנה ${orderId}`
    });

    if (result.success) {
      console.log(`[PAYMENT] Payment page created for order ${orderId}`);
    }

    res.json({
      success: result.success,
      data: result.success ? { url: result.url, gateway: result.gateway } : null,
      error: result.error
    });
  } catch (err) {
    console.error('Error creating payment page:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment page'
    });
  }
});

/**
 * POST /api/payment/process
 * Process payment directly (legacy - for server-side processing if needed)
 */
app.post('/api/payment/process', async (req, res) => {
  try {
    const { orderId, amount, cardNumber, expiry, cvv, customerName, customerEmail, customerPhone } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'orderId and amount are required'
      });
    }

    // Use the payment module for real processing
    const result = await processPayment({
      amount,
      currency: 'ILS',
      cardNumber,
      expiry,
      cvv,
      orderId,
      description: `אישור עירייה לטאבו - הזמנה ${orderId}`,
      customerName,
      customerEmail,
      customerPhone
    });

    if (result.success) {
      // Update order payment status
      const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      db.createPayment({
        id: paymentId,
        order_id: orderId,
        amount,
        currency: 'ILS',
        provider: result.gateway || 'tranzila',
        transaction_id: result.transactionId,
        status: 'completed',
        payment_data: result
      });

      db.updateOrder(orderId, {
        payment_status: 'completed',
        status: 'paid',
        transaction_id: result.transactionId
      });

      db.logAudit(orderId, 'payment_completed', {
        transactionId: result.transactionId,
        amount,
        gateway: result.gateway
      });
    }

    console.log(`Payment for order ${orderId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);

    res.json({
      success: result.success,
      message: result.success ? 'Payment processed successfully' : 'Payment failed',
      data: {
        orderId,
        amount,
        status: result.success ? 'approved' : 'failed',
        transactionId: result.transactionId,
        authCode: result.authCode,
        error: result.error
      }
    });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process payment'
    });
  }
});

/**
 * POST /api/payment/webhook/tranzila
 * Tranzila payment notification webhook (notify_url)
 * Tranzila sends POST with form-urlencoded data after payment
 */
app.post('/api/payment/webhook/tranzila', express.urlencoded({ extended: true }), (req, res) => {
  try {
    console.log('[PAYMENT WEBHOOK] Tranzila notification received:', JSON.stringify(req.body));

    const webhookResult = handlePaymentWebhook(req.body, req.headers, 'tranzila');

    const { orderId, status, transactionId } = webhookResult;

    if (orderId && (status === 'completed' || status === 'success')) {
      // Check if order exists
      const order = db.getOrderById(orderId);
      if (order) {
        // Create payment record
        const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        db.createPayment({
          id: paymentId,
          order_id: orderId,
          amount: req.body.sum || 0,
          currency: 'ILS',
          provider: 'tranzila',
          transaction_id: transactionId,
          status: 'completed',
          payment_data: req.body
        });

        // Update order payment status
        db.updateOrder(orderId, {
          payment_status: 'completed',
          status: 'paid',
          transaction_id: transactionId
        });

        db.logAudit(orderId, 'webhook_payment_confirmed', {
          transactionId,
          method: 'tranzila',
          webhookData: req.body
        });

        console.log(`[PAYMENT] Payment confirmed for order ${orderId} (transaction: ${transactionId})`);
      } else {
        console.warn(`[PAYMENT] Order not found for webhook: ${orderId}`);
      }
    } else {
      console.log(`[PAYMENT] Payment not confirmed. Order: ${orderId}, Status: ${status}`);
    }

    // Tranzila expects a simple response
    res.send('OK');
  } catch (err) {
    console.error('[PAYMENT WEBHOOK] Error:', err);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/payment/webhook
 * Generic payment gateway webhook (legacy)
 */
app.post('/api/payment/webhook', (req, res) => {
  try {
    const webhookResult = handlePaymentWebhook(req.body, req.headers);
    if (!webhookResult.verified) {
      console.warn('Payment webhook signature verification failed');
      return res.status(403).json({ success: false, error: 'Webhook verification failed' });
    }

    const { orderId, status, transactionId } = webhookResult;

    if (status === 'completed' || status === 'approved' || status === 'success') {
      const order = db.getOrderById(orderId);
      if (order) {
        // Create payment record
        const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        db.createPayment({
          id: paymentId,
          order_id: orderId,
          amount: 0,
          currency: 'ILS',
          provider: webhookResult.gateway || 'unknown',
          transaction_id: transactionId,
          status: 'completed',
          payment_data: req.body
        });

        // Update order
        db.updateOrder(orderId, {
          payment_status: 'completed',
          status: 'paid',
          confirmation_number: transactionId
        });

        db.logAudit(orderId, 'payment_confirmed', {
          transactionId,
          gateway: webhookResult.gateway
        });

        console.log(`Payment confirmed for order ${orderId}`);
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (err) {
    console.error('Error processing webhook:', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// ============ Admin Endpoints ============

/**
 * GET /api/admin/stats
 * Dashboard stats (admin only)
 */
app.get('/api/admin/stats', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const stats = db.getOrderStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

/**
 * GET /api/admin/orders
 * All orders with filters (admin only)
 */
app.get('/api/admin/orders', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { status, paymentStatus, municipality } = req.query;
    let orders = db.getRecentOrders(1000); // Get recent orders (sufficient for most cases)

    // Apply filters
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    if (paymentStatus) {
      orders = orders.filter(o => o.payment_status === paymentStatus);
    }
    if (municipality) {
      orders = orders.filter(o => o.municipality_code === municipality);
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (err) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

/**
 * POST /api/admin/process/:orderId
 * Trigger automation for an order (admin only)
 */
app.post('/api/admin/process/:orderId', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const orderId = req.params.orderId;
    const order = db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if order is paid
    if (order.payment_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Order must be paid before processing'
      });
    }

    // Trigger automation
    const updatedOrder = db.updateOrderStatus(orderId, 'processing');

    db.logAudit(orderId, 'processing_initiated', {
      triggeredBy: 'admin'
    });

    // Call processOrder from automation module (async)
    processOrder(order).catch(err => {
      console.error('Error in order processing:', err);
    });

    res.json({
      success: true,
      message: 'Order processing initiated',
      data: updatedOrder
    });
  } catch (err) {
    console.error('Error processing order:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process order',
      message: err.message
    });
  }
});

// ============ Mount Routers ============

app.use('/sms', smsRouter);

// Mount WhatsApp routes
app.use('/api/whatsapp', whatsappRouter);

// Mount admin routes
const adminRouter = require('./admin-routes');
app.use('/api/admin', adminRouter);

// Mount client routes
const clientRouter = require('./client-routes');
app.use('/api/client', clientRouter);

// ============ HTML Page Routes ============

/**
 * GET /admin
 * Serve admin dashboard HTML page
 */
app.get('/admin', (req, res) => {
  // Admin HTML page handles its own authentication via JS
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/**
 * GET /dashboard
 * Serve client dashboard HTML page
 */
app.get('/dashboard', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'client-dashboard.html'));
  } catch (err) {
    console.error('Error serving dashboard page:', err);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ============ Error Handling Middleware ============

/**
 * 404 Not Found
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error logging middleware
app.use(errorLoggingMiddleware());

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  const requestId = res.locals.requestId || 'unknown';

  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Track error in monitoring
  monitoring.trackError(err, {
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Multer errors
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message
    });
  }

  // Other errors
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    requestId,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============ Start Server ============

// Only start listening if this is the main module (not required by tests)
if (require.main === module) {
  // Initialize database first (async)
  initializeDatabase().then(() => {
  const server = app.listen(PORT, () => {
    const message = `
╔════════════════════════════════════════════════════════════════╗
║          אישורטאבו - Municipal Approvals System               ║
║                                                                ║
║  Server running on: http://localhost:${PORT}
║  Environment: ${NODE_ENV}
║  Node.js: ${process.version}
║  Database: SQLite (sql.js)
║  Monitoring: Enabled
║  Logging: ${path.join(__dirname, 'logs')}
╚════════════════════════════════════════════════════════════════╝
    `;

    console.log(message);
    logger.info('Server started', {
      port: PORT,
      env: NODE_ENV,
      nodeVersion: process.version
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      logger.info('HTTP server closed');
      db.closeDatabase();
      logger.info('Database closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(() => {
      logger.info('HTTP server closed');
      db.closeDatabase();
      logger.info('Database closed');
      process.exit(0);
    });
  });
  }); // end initializeDatabase().then()
}

module.exports = app;
