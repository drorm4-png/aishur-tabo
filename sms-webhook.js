const express = require('express');
const twilio = require('twilio');

const router = express.Router();

// In-memory storage for OTPs
const otpStore = new Map();
let otpCounter = 0;

// Configuration from environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const VALIDATE_TWILIO_SIGNATURE = process.env.VALIDATE_TWILIO_SIGNATURE === 'true';

// OTP expiration time in milliseconds (5 minutes)
const OTP_EXPIRATION_MS = 5 * 60 * 1000;

// Regex patterns to extract OTP codes (4-6 digit codes)
const OTP_PATTERNS = [
  /\b(\d{4,6})\b/,           // Simple 4-6 digit code
  /code[:\s]+(\d{4,6})/i,    // "code: 1234"
  /otp[:\s]+(\d{4,6})/i,     // "OTP: 1234"
  /password[:\s]+(\d{4,6})/i // "password: 1234"
];

/**
 * Extract OTP code from message text
 * @param {string} messageBody - SMS message body
 * @returns {string|null} - Extracted OTP code or null if not found
 */
function extractOTPCode(messageBody) {
  if (!messageBody || typeof messageBody !== 'string') {
    return null;
  }

  for (const pattern of OTP_PATTERNS) {
    const match = messageBody.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if an OTP has expired
 * @param {Object} otp - OTP object with timestamp
 * @returns {boolean} - True if expired
 */
function isOTPExpired(otp) {
  return Date.now() - otp.timestamp > OTP_EXPIRATION_MS;
}

/**
 * Clean up expired OTPs from storage
 */
function cleanupExpiredOTPs() {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [id, otp] of otpStore.entries()) {
    if (isOTPExpired(otp)) {
      otpStore.delete(id);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[OTP Cleanup] Removed ${cleanedCount} expired OTPs`);
  }

  return cleanedCount;
}

/**
 * Get the latest unconsumed OTP for a phone number
 * @param {string} phone - Phone number (last 4 digits typically)
 * @returns {Object|null} - OTP object or null if not found
 */
function getLatestOTP(phone) {
  cleanupExpiredOTPs();

  let latestOTP = null;
  let latestTimestamp = 0;

  for (const [id, otp] of otpStore.entries()) {
    // Match phone number (could be last 4 digits or full number)
    if (
      (otp.phone === phone || otp.phone.slice(-4) === phone.slice(-4)) &&
      otp.status === 'pending' &&
      otp.timestamp > latestTimestamp &&
      !isOTPExpired(otp)
    ) {
      latestOTP = { id, ...otp };
      latestTimestamp = otp.timestamp;
    }
  }

  return latestOTP;
}

/**
 * Mark an OTP as consumed
 * @param {string} id - OTP ID
 * @returns {boolean} - True if successful
 */
function consumeOTP(id) {
  if (otpStore.has(id)) {
    const otp = otpStore.get(id);
    if (!isOTPExpired(otp)) {
      otp.status = 'consumed';
      otp.consumedAt = Date.now();
      return true;
    } else {
      otpStore.delete(id);
      return false;
    }
  }
  return false;
}

/**
 * Twilio webhook signature validation middleware
 * Optional based on VALIDATE_TWILIO_SIGNATURE env var
 */
function validateTwilioSignature(req, res, next) {
  if (!VALIDATE_TWILIO_SIGNATURE) {
    return next();
  }

  const twilio_url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  const twilio_signature = req.get('X-Twilio-Signature');

  try {
    const isValid = twilio.validateRequest(
      TWILIO_AUTH_TOKEN,
      twilio_signature,
      twilio_url,
      params
    );

    if (!isValid) {
      console.warn('[Twilio Validation] Invalid signature detected');
      return res.status(403).send('Unauthorized');
    }
    next();
  } catch (error) {
    console.error('[Twilio Validation] Error validating signature:', error.message);
    return res.status(500).send('Validation error');
  }
}

/**
 * POST /webhook/sms
 * Receives incoming SMS messages from Twilio
 */
router.post('/webhook/sms', validateTwilioSignature, (req, res) => {
  try {
    const from = req.body.From;
    const to = req.body.To;
    const messageBody = req.body.Body;
    const messageId = req.body.MessageSid;
    const numMedia = req.body.NumMedia || 0;

    console.log(`[SMS Received] From: ${from}, To: ${to}, MessageSid: ${messageId}`);

    // Extract OTP code
    const otpCode = extractOTPCode(messageBody);

    if (!otpCode) {
      console.log(`[SMS] No OTP code found in message: "${messageBody}"`);
      return res.status(200).send('OK');
    }

    // Create OTP record
    const otpId = `otp_${++otpCounter}_${Date.now()}`;
    const otpRecord = {
      id: otpId,
      phone: from,
      code: otpCode,
      timestamp: Date.now(),
      rawMessage: messageBody,
      messageId: messageId,
      from: from,
      to: to,
      status: 'pending',
      expiresAt: Date.now() + OTP_EXPIRATION_MS
    };

    // Store OTP
    otpStore.set(otpId, otpRecord);

    console.log(
      `[OTP Stored] ID: ${otpId}, Phone: ${from}, Code: ${otpCode}, Expires in: 5 minutes`
    );
    console.log(`[OTP Store] Total stored: ${otpStore.size}`);

    // Acknowledge to Twilio
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SMS Webhook Error]', error.message, error.stack);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * GET /api/otp/latest
 * Get latest unconsumed OTP for a phone number
 * Query params: phone (required) - phone number or last 4 digits
 */
router.get('/api/otp/latest', (req, res) => {
  try {
    const phone = req.query.phone;

    if (!phone) {
      return res.status(400).json({
        error: 'Phone number required',
        example: '/api/otp/latest?phone=1234'
      });
    }

    const latestOTP = getLatestOTP(phone);

    if (!latestOTP) {
      return res.status(404).json({
        error: 'No pending OTP found for this phone',
        phone: phone
      });
    }

    console.log(`[OTP Retrieved] Phone: ${phone}, Code: ${latestOTP.code}`);

    res.json({
      id: latestOTP.id,
      phone: latestOTP.phone,
      code: latestOTP.code,
      timestamp: latestOTP.timestamp,
      expiresAt: latestOTP.expiresAt,
      expiresIn: Math.round((latestOTP.expiresAt - Date.now()) / 1000),
      status: latestOTP.status
    });
  } catch (error) {
    console.error('[Get Latest OTP Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/otp/consume/:id
 * Mark an OTP as consumed
 */
router.post('/api/otp/consume/:id', (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({ error: 'OTP ID required' });
    }

    const success = consumeOTP(id);

    if (!success) {
      return res.status(404).json({
        error: 'OTP not found or expired',
        id: id
      });
    }

    const otp = otpStore.get(id);
    console.log(`[OTP Consumed] ID: ${id}, Code: ${otp.code}`);

    res.json({
      success: true,
      id: id,
      status: 'consumed',
      consumedAt: otp.consumedAt
    });
  } catch (error) {
    console.error('[Consume OTP Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/otp/history
 * List recent OTPs (admin endpoint)
 * Query params: limit (optional) - max number of OTPs to return, default 50
 */
router.get('/api/otp/history', (req, res) => {
  try {
    cleanupExpiredOTPs();

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const otps = [];

    // Get all OTPs sorted by timestamp (newest first)
    const sortedOTPs = Array.from(otpStore.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, limit);

    for (const [id, otp] of sortedOTPs) {
      otps.push({
        id: id,
        phone: otp.phone,
        code: otp.code,
        timestamp: otp.timestamp,
        expiresAt: otp.expiresAt,
        isExpired: isOTPExpired(otp),
        status: otp.status,
        messageBody: otp.rawMessage,
        messageId: otp.messageId
      });
    }

    console.log(`[OTP History] Retrieved ${otps.length} OTPs`);

    res.json({
      count: otps.length,
      total_stored: otpStore.size,
      otps: otps
    });
  } catch (error) {
    console.error('[Get OTP History Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/otp/stats
 * Get OTP storage statistics
 */
router.get('/api/otp/stats', (req, res) => {
  try {
    cleanupExpiredOTPs();

    let pending = 0;
    let consumed = 0;
    let expired = 0;

    for (const otp of otpStore.values()) {
      if (isOTPExpired(otp)) {
        expired++;
      } else if (otp.status === 'consumed') {
        consumed++;
      } else {
        pending++;
      }
    }

    res.json({
      total: otpStore.size,
      pending: pending,
      consumed: consumed,
      expired: expired,
      counter: otpCounter,
      expirationMs: OTP_EXPIRATION_MS,
      validationEnabled: VALIDATE_TWILIO_SIGNATURE
    });
  } catch (error) {
    console.error('[Get Stats Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/otp/cleanup
 * Manually trigger cleanup of expired OTPs
 */
router.post('/api/otp/cleanup', (req, res) => {
  try {
    const cleanedCount = cleanupExpiredOTPs();

    res.json({
      success: true,
      cleaned: cleanedCount,
      remaining: otpStore.size
    });
  } catch (error) {
    console.error('[Cleanup Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Periodic cleanup every minute
setInterval(() => {
  cleanupExpiredOTPs();
}, 60000);

// Export the router and helper functions
module.exports = {
  router,
  getLatestOTP,
  consumeOTP,
  cleanupExpiredOTPs,
  extractOTPCode,
  isOTPExpired
};
