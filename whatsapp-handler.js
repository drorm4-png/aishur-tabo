/**
 * WhatsApp Integration Module for אישורטאבו
 * Handles WhatsApp communication for POA signing flow
 * Receives signed POA PDFs/images and manages outbound messages
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');

const router = express.Router();

// Configuration
const CONFIG = {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || '',
  VALIDATE_TWILIO_SIGNATURE: process.env.VALIDATE_TWILIO_SIGNATURE === 'true'
};

// Multer configuration for signed POA uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'poa-signed');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9).toUpperCase();
    cb(null, `signed-poa-${timestamp}-${randomStr}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB for files
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only PDF and images allowed. Got: ${file.mimetype}`));
    }
  }
});

/**
 * Load orders from JSON (reusing server.js pattern)
 */
function loadOrders() {
  const ordersFile = path.join(__dirname, 'data', 'orders.json');
  if (!fs.existsSync(ordersFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(ordersFile, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[WhatsApp] Error loading orders:', err);
    return [];
  }
}

/**
 * Save orders to JSON
 */
function saveOrders(orders) {
  const ordersFile = path.join(__dirname, 'data', 'orders.json');
  try {
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('[WhatsApp] Error saving orders:', err);
    throw err;
  }
}

/**
 * Get Twilio client
 */
function getTwilioClient() {
  if (!CONFIG.TWILIO_ACCOUNT_SID || !CONFIG.TWILIO_AUTH_TOKEN) {
    return null;
  }
  return twilio(CONFIG.TWILIO_ACCOUNT_SID, CONFIG.TWILIO_AUTH_TOKEN);
}

/**
 * Normalize Israeli phone number
 */
function normalizePhoneNumber(phone) {
  let normalized = phone.replace(/\D/g, '');
  if (!normalized.startsWith('972')) {
    if (normalized.startsWith('0')) {
      normalized = '972' + normalized.slice(1);
    } else {
      normalized = '972' + normalized;
    }
  }
  return '+' + normalized;
}

/**
 * Twilio webhook signature validation
 */
function validateTwilioSignature(req, res, next) {
  if (!CONFIG.VALIDATE_TWILIO_SIGNATURE) {
    return next();
  }

  const twilio_url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  const twilio_signature = req.get('X-Twilio-Signature');

  try {
    const isValid = twilio.validateRequest(
      CONFIG.TWILIO_AUTH_TOKEN,
      twilio_signature,
      twilio_url,
      params
    );

    if (!isValid) {
      console.warn('[WhatsApp Webhook] Invalid Twilio signature detected');
      return res.status(403).send('Unauthorized');
    }
    next();
  } catch (error) {
    console.error('[WhatsApp Webhook] Error validating signature:', error.message);
    return res.status(500).send('Validation error');
  }
}

/**
 * POST /webhook
 * Receives incoming WhatsApp messages from Twilio
 */
router.post('/webhook', validateTwilioSignature, express.urlencoded({ extended: true }), (req, res) => {
  try {
    const from = req.body.From;
    const to = req.body.To;
    const messageBody = req.body.Body;
    const messageSid = req.body.MessageSid;
    const numMedia = parseInt(req.body.NumMedia || 0);

    console.log(`[WhatsApp Incoming] From: ${from}, MessageSid: ${messageSid}, Media: ${numMedia}`);

    // Extract phone number from Twilio format (whatsapp:+972...)
    const phoneMatch = from.match(/\+?\d+/);
    const senderPhone = phoneMatch ? phoneMatch[0] : '';

    // Check if message has media attachments (PDF or image)
    if (numMedia > 0) {
      // Process attached files
      processMediaAttachments(req.body, senderPhone);
    } else if (messageBody) {
      // Process text message
      console.log(`[WhatsApp] Text message from ${senderPhone}: ${messageBody}`);
      // Could implement keyword-based responses here
    }

    // Acknowledge receipt to Twilio
    res.status(200).send('OK');
  } catch (error) {
    console.error('[WhatsApp Webhook Error]', error.message, error.stack);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Process media attachments from WhatsApp
 */
async function processMediaAttachments(webhookData, senderPhone) {
  try {
    const numMedia = parseInt(webhookData.NumMedia || 0);
    const orders = loadOrders();

    // Find order by phone number
    const order = orders.find(o => {
      const normalized = o.phone.replace(/\D/g, '');
      const senderNormalized = senderPhone.replace(/\D/g, '');
      return normalized === senderNormalized || normalized.endsWith(senderNormalized.slice(-10));
    });

    if (!order) {
      console.warn(`[WhatsApp] No order found for phone ${senderPhone}`);
      // Send error message back
      await sendWhatsAppMessage(
        senderPhone,
        'צוות לא בן נוכל למצוא הזמנה בעבור מספר הטלפון שלך. אנא בדוק את מספר הטלפון והנסה שוב.'
      );
      return;
    }

    console.log(`[WhatsApp] Processing ${numMedia} files for order ${order.id}`);

    // Download and save media files
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = webhookData[`MediaUrl${i}`];
      const mediaContentType = webhookData[`MediaContentType${i}`];

      if (mediaUrl) {
        try {
          await downloadAndSaveMediaFile(mediaUrl, order.id, mediaContentType);
          console.log(`[WhatsApp] Downloaded and saved media ${i + 1}/${numMedia} for order ${order.id}`);
        } catch (err) {
          console.error(`[WhatsApp] Failed to download media ${i}:`, err.message);
        }
      }
    }

    // Update order status to indicate POA received
    const orderIndex = orders.findIndex(o => o.id === order.id);
    if (orderIndex !== -1) {
      orders[orderIndex].status = 'poa_received';
      orders[orderIndex].poaReceivedAt = new Date().toISOString();
      orders[orderIndex].poaReceivedVia = 'whatsapp';
      saveOrders(orders);

      console.log(`[WhatsApp] Updated order ${order.id} status to poa_received`);
    }

    // Send confirmation message back
    await sendWhatsAppMessage(
      senderPhone,
      `תודה! קיבלנו את הייפוי כוח שלך עבור הזמנה ${order.id}. צוותנו עכשיו בודק את המסמך ויצור קשר אם נדרוש מידע נוסף.`
    );

    // Send internal notification to admin
    console.log(`[WhatsApp] POA received via WhatsApp for order ${order.id}`);

  } catch (error) {
    console.error('[WhatsApp] Error processing media:', error.message);
  }
}

/**
 * Download media file from Twilio URL and save locally
 */
async function downloadAndSaveMediaFile(mediaUrl, orderId, contentType) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const http = require('http');

    const protocol = mediaUrl.startsWith('https') ? https : http;
    const uploadDir = path.join(__dirname, 'uploads', 'poa-signed');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Determine file extension based on content type
    let ext = '.bin';
    if (contentType.includes('pdf')) ext = '.pdf';
    else if (contentType.includes('image/jpeg')) ext = '.jpg';
    else if (contentType.includes('image/png')) ext = '.png';

    const filename = `signed-poa-whatsapp-${orderId}-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);
    const file = fs.createWriteStream(filepath);

    // Add Twilio auth header if needed
    const headers = {};
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    protocol.get(mediaUrl, { headers }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download media: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filepath);
        console.log(`[WhatsApp] Saved media file: ${filename}`);
      });

      file.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete partial file
        reject(err);
      });
    }).on('error', reject);
  });
}

/**
 * Send WhatsApp message outbound
 */
async function sendWhatsAppMessage(phoneNumber, message) {
  const client = getTwilioClient();

  if (!client || !CONFIG.TWILIO_WHATSAPP_NUMBER) {
    console.warn('[WhatsApp] Twilio WhatsApp not configured');
    return { success: false, skipped: true };
  }

  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const response = await client.messages.create({
      body: message,
      from: 'whatsapp:' + CONFIG.TWILIO_WHATSAPP_NUMBER,
      to: 'whatsapp:' + normalizedPhone
    });

    console.log(`[WhatsApp Outbound] Sent to ${phoneNumber}: ${response.sid}`);
    return { success: true, messageId: response.sid };
  } catch (error) {
    console.error(`[WhatsApp Outbound] Failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * POST /send
 * Send WhatsApp message to client (admin endpoint)
 */
router.post('/send', async (req, res) => {
  try {
    const { orderId, phoneNumber, message } = req.body;

    if (!orderId || !phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'orderId, phoneNumber, and message are required'
      });
    }

    const result = await sendWhatsAppMessage(phoneNumber, message);

    res.json(result);
  } catch (error) {
    console.error('[WhatsApp Send Endpoint] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /send-poa
 * Send POA PDF to client via WhatsApp for signing
 */
router.post('/send-poa', async (req, res) => {
  try {
    const { orderId, phoneNumber, poaUrl } = req.body;

    if (!orderId || !phoneNumber || !poaUrl) {
      return res.status(400).json({
        success: false,
        error: 'orderId, phoneNumber, and poaUrl are required'
      });
    }

    const client = getTwilioClient();

    if (!client || !CONFIG.TWILIO_WHATSAPP_NUMBER) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp not configured'
      });
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Send the POA document via WhatsApp
    const response = await client.messages.create({
      from: 'whatsapp:' + CONFIG.TWILIO_WHATSAPP_NUMBER,
      to: 'whatsapp:' + normalizedPhone,
      mediaUrl: [poaUrl],
      body: `שלום! לצורך המשך תהליך קבלת אישור העירייה, אנא חתום על המסמך המצורף וחזור אלינו בעותו. הזמנה: ${orderId}`
    });

    console.log(`[WhatsApp] Sent POA to ${phoneNumber}: ${response.sid}`);

    res.json({
      success: true,
      messageId: response.sid,
      orderId,
      phoneNumber
    });
  } catch (error) {
    console.error('[WhatsApp Send POA] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /receive-poa
 * Receive signed POA upload (can be called from web form too)
 */
router.post('/receive-poa', upload.single('file'), async (req, res) => {
  try {
    const { orderId, phoneNumber } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    if (!orderId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'orderId and phoneNumber are required'
      });
    }

    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Update order
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].status = 'poa_received';
    orders[orderIndex].poaReceivedAt = new Date().toISOString();
    orders[orderIndex].poaReceivedVia = 'whatsapp_upload';
    orders[orderIndex].poaSignedFilePath = req.file.path;
    saveOrders(orders);

    // Send confirmation
    await sendWhatsAppMessage(
      phoneNumber,
      `תודה! קיבלנו את הייפוי כוח החתום שלך עבור הזמנה ${orderId}. נעדכן אותך בהמשך התהליך.`
    );

    res.status(200).json({
      success: true,
      message: 'POA received successfully',
      file: {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      }
    });

    console.log(`[WhatsApp] Received POA for order ${orderId}: ${req.file.filename}`);
  } catch (error) {
    console.error('[WhatsApp Receive POA] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /status/:orderId
 * Check WhatsApp integration status for an order
 */
router.get('/status/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: {
        orderId,
        phone: order.phone,
        poaReceivedAt: order.poaReceivedAt || null,
        poaReceivedVia: order.poaReceivedVia || null,
        poaSignedFilePath: order.poaSignedFilePath || null,
        status: order.status
      }
    });
  } catch (error) {
    console.error('[WhatsApp Status] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export router and functions
module.exports = {
  router,
  sendWhatsAppMessage,
  normalizePhoneNumber
};
