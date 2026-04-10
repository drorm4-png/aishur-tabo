/**
 * Payment Processing Module for אישורטאבו
 * Supports Israeli payment gateways: Tranzila (primary) and Cardcom (fallback)
 * Handles payment processing, refunds, webhooks, and pricing logic
 */

const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

// Configuration
const CONFIG = {
  PROVIDER: process.env.PAYMENT_PROVIDER || 'tranzila',
  TEST_MODE: process.env.PAYMENT_TEST_MODE === 'true',
  SERVICE_FEE: parseInt(process.env.SERVICE_FEE || '350'), // Default 350 ILS
  VAT_RATE: 0.17, // 17% VAT (מע"מ)
  CURRENCY: 'ILS',
  CURRENCY_CODE: 1, // 1 = ILS in Tranzila

  // Tranzila Configuration
  TRANZILA: {
    ENDPOINT: 'https://secure5.tranzila.com/cgi-bin/tranzila71u.cgi',
    SUPPLIER: process.env.TRANZILA_SUPPLIER || 'test',
    TOKEN: process.env.TRANZILA_TOKEN || 'test_token',
  },

  // Cardcom Configuration
  CARDCOM: {
    ENDPOINT: 'https://secure.cardcom.solutions/api/v11/LowProfile/Create',
    CLIENT_ID: process.env.CARDCOM_CLIENT_ID || '',
    TERMINAL_ID: process.env.CARDCOM_TERMINAL_ID || '',
    AUTHENTICATION_TOKEN: process.env.CARDCOM_AUTH_TOKEN || '',
  }
};

/**
 * Mask card number for logging (keep only last 4 digits)
 */
function maskCardNumber(cardNumber) {
  if (!cardNumber) return 'UNKNOWN';
  return '*'.repeat(cardNumber.length - 4) + cardNumber.slice(-4);
}

/**
 * Calculate total amount including service fee and VAT
 * @param {number} municipalFee - Municipal fee in ILS
 * @param {boolean} includeVAT - Whether to include VAT in calculation
 * @returns {object} { subtotal, serviceFee, subtotalWithFee, vat, total }
 */
function calculateTotal(municipalFee = 0, includeVAT = true) {
  const subtotal = municipalFee;
  const serviceFee = CONFIG.SERVICE_FEE;
  const subtotalWithFee = subtotal + serviceFee;

  if (includeVAT) {
    const vat = Math.round(subtotalWithFee * CONFIG.VAT_RATE);
    const total = subtotalWithFee + vat;

    return {
      subtotal,
      serviceFee,
      subtotalWithFee,
      vat,
      total,
      currency: CONFIG.CURRENCY
    };
  }

  return {
    subtotal,
    serviceFee,
    subtotalWithFee,
    vat: 0,
    total: subtotalWithFee,
    currency: CONFIG.CURRENCY
  };
}

/**
 * Validate payment input data
 */
function validatePaymentData(paymentData) {
  const errors = [];

  if (!paymentData.amount || paymentData.amount <= 0) {
    errors.push('Invalid amount');
  }

  if (!paymentData.cardNumber || !/^\d{13,19}$/.test(paymentData.cardNumber.replace(/\s/g, ''))) {
    errors.push('Invalid card number');
  }

  if (!paymentData.expiry || !/^\d{2}\/\d{2}$/.test(paymentData.expiry)) {
    errors.push('Invalid expiry format (MM/YY)');
  }

  if (!paymentData.cvv || !/^\d{3,4}$/.test(paymentData.cvv)) {
    errors.push('Invalid CVV');
  }

  if (!paymentData.orderId) {
    errors.push('Order ID is required');
  }

  if (!paymentData.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paymentData.customerEmail)) {
    errors.push('Invalid email');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Make HTTPS request (generic helper)
 */
function makeRequest(url, method, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: responseData
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Process payment via Tranzila
 */
async function processPaymentTranzila(paymentData) {
  const validation = validatePaymentData(paymentData);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', ')
    };
  }

  // Parse expiry (MM/YY)
  const [month, year] = paymentData.expiry.split('/');
  const expDate = year + month; // MMYY format for Tranzila

  const cardNumber = paymentData.cardNumber.replace(/\s/g, '');

  // Build Tranzila request
  const params = {
    supplier: CONFIG.TRANZILA.SUPPLIER,
    sum: paymentData.amount.toString(),
    ccno: cardNumber,
    expdate: expDate,
    mycvv: paymentData.cvv,
    currency: CONFIG.CURRENCY_CODE,
    order: paymentData.orderId,
    name: paymentData.customerName || '',
    email: paymentData.customerEmail || '',
    phone: paymentData.customerPhone || '',
    description: paymentData.description || 'אישור עירייה'
  };

  // Add authentication token if provided
  if (CONFIG.TRANZILA.TOKEN) {
    params.token = CONFIG.TRANZILA.TOKEN;
  }

  try {
    const queryStr = querystring.stringify(params);
    const response = await makeRequest(CONFIG.TRANZILA.ENDPOINT, 'POST', queryStr);

    // Parse Tranzila response
    const responseData = querystring.parse(response.body);

    console.log(`[PAYMENT] Tranzila response for order ${paymentData.orderId}: Response=${responseData.Response}`);

    if (responseData.Response === '000') {
      // Success
      return {
        success: true,
        transactionId: responseData.TransID || responseData.Transact,
        authCode: responseData.AuthCode || '',
        gateway: 'tranzila',
        amount: paymentData.amount,
        orderId: paymentData.orderId,
        timestamp: new Date().toISOString()
      };
    } else {
      // Payment failed
      const errorCode = responseData.Response || 'UNKNOWN';
      const errorDesc = responseData.Description || 'Payment declined';

      return {
        success: false,
        error: `Payment failed (${errorCode}): ${errorDesc}`,
        errorCode,
        gateway: 'tranzila'
      };
    }
  } catch (error) {
    console.error(`[PAYMENT] Tranzila error for order ${paymentData.orderId}:`, error.message);
    return {
      success: false,
      error: `Payment processing error: ${error.message}`,
      gateway: 'tranzila'
    };
  }
}

/**
 * Process payment via Cardcom
 */
async function processPaymentCardcom(paymentData) {
  const validation = validatePaymentData(paymentData);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', ')
    };
  }

  if (!CONFIG.CARDCOM.CLIENT_ID || !CONFIG.CARDCOM.TERMINAL_ID) {
    return {
      success: false,
      error: 'Cardcom credentials not configured'
    };
  }

  try {
    const [month, year] = paymentData.expiry.split('/');
    const cardNumber = paymentData.cardNumber.replace(/\s/g, '');

    const requestBody = JSON.stringify({
      clientId: CONFIG.CARDCOM.CLIENT_ID,
      terminalId: CONFIG.CARDCOM.TERMINAL_ID,
      invoiceNr: paymentData.orderId,
      cardNumber: cardNumber,
      cardExpiryMonth: parseInt(month),
      cardExpiryYear: 2000 + parseInt(year),
      cvvCode: paymentData.cvv,
      sum: paymentData.amount,
      currency: '1', // ILS
      phone: paymentData.customerPhone || '',
      email: paymentData.customerEmail || '',
      name: paymentData.customerName || '',
      description: paymentData.description || 'אישור עירייה'
    });

    const headers = {
      'Authorization': `Bearer ${CONFIG.CARDCOM.AUTHENTICATION_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    };

    const response = await makeRequest(CONFIG.CARDCOM.ENDPOINT, 'POST', requestBody, headers);

    if (response.status !== 200) {
      return {
        success: false,
        error: `Cardcom API error: ${response.status}`,
        gateway: 'cardcom'
      };
    }

    const result = JSON.parse(response.body);

    if (result.status === 0 || result.isSuccess) {
      // Success
      return {
        success: true,
        transactionId: result.transactionId || result.TokenId,
        authCode: result.authCode || '',
        gateway: 'cardcom',
        amount: paymentData.amount,
        orderId: paymentData.orderId,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        error: `Payment failed: ${result.statusDescription || 'Unknown error'}`,
        errorCode: result.status,
        gateway: 'cardcom'
      };
    }
  } catch (error) {
    console.error(`[PAYMENT] Cardcom error for order ${paymentData.orderId}:`, error.message);
    return {
      success: false,
      error: `Payment processing error: ${error.message}`,
      gateway: 'cardcom'
    };
  }
}

/**
 * Process a payment via the configured gateway
 * Falls back to secondary gateway on failure if configured
 */
async function processPayment(paymentData) {
  if (!paymentData) {
    return {
      success: false,
      error: 'Payment data is required'
    };
  }

  console.log(`[PAYMENT] Processing payment for order ${paymentData.orderId} via ${CONFIG.PROVIDER} (card: ${maskCardNumber(paymentData.cardNumber)})`);

  let result;

  if (CONFIG.PROVIDER === 'cardcom') {
    result = await processPaymentCardcom(paymentData);
    // Fallback to Tranzila if Cardcom fails
    if (!result.success) {
      console.log(`[PAYMENT] Cardcom failed, attempting Tranzila fallback for order ${paymentData.orderId}`);
      result = await processPaymentTranzila(paymentData);
    }
  } else {
    // Default to Tranzila
    result = await processPaymentTranzila(paymentData);
    // Fallback to Cardcom if Tranzila fails
    if (!result.success && CONFIG.CARDCOM.CLIENT_ID) {
      console.log(`[PAYMENT] Tranzila failed, attempting Cardcom fallback for order ${paymentData.orderId}`);
      result = await processPaymentCardcom(paymentData);
    }
  }

  return result;
}

/**
 * Create hosted payment page (iframe URL) via Tranzila
 * Uses Tranzila's secure hosted payment page - card details never touch our server
 *
 * Tranzila iframe URL format:
 * https://direct.tranzila.com/{supplier}/iframe.html?sum=X&currency=1&lang=il&...
 */
async function createPaymentPageTranzila(orderData) {
  if (!orderData.amount || !orderData.orderId) {
    return {
      success: false,
      error: 'Amount and orderId are required'
    };
  }

  try {
    const supplier = CONFIG.TRANZILA.SUPPLIER;

    // Build parameters for Tranzila hosted payment page
    const params = {
      sum: orderData.amount.toString(),
      currency: CONFIG.CURRENCY_CODE.toString(),
      lang: 'il', // Hebrew interface
      order_id: orderData.orderId,
      contact: orderData.customerName || '',
      email: orderData.customerEmail || '',
      phone: orderData.customerPhone || '',
      cred_type: '1', // Regular charge
      tranmode: 'A', // Authorization + charge
      nologo: '1', // Clean look
      trButtonColor: '1a56db', // Match site primary color
      buttonLabel: 'שלם עכשיו',
      fail_url_address: orderData.failUrl || '',
      notify_url_address: orderData.notifyUrl || '', // Webhook URL for payment confirmation
      success_url_address: orderData.successUrl || '',
      pdesc: orderData.description || 'אישור עירייה לטאבו'
    };

    // Tranzila hosted page URL
    // In test mode: https://direct.tranzila.com/test/iframe.html
    // In production: https://direct.tranzila.com/{supplier}/iframe.html
    const baseUrl = `https://direct.tranzila.com/${supplier}/iframe.html`;
    const iframeUrl = baseUrl + '?' + querystring.stringify(params);

    console.log(`[PAYMENT] Created Tranzila payment page for order ${orderData.orderId} (${orderData.amount} ILS)`);

    return {
      success: true,
      url: iframeUrl,
      gateway: 'tranzila',
      orderId: orderData.orderId
    };
  } catch (error) {
    console.error('[PAYMENT] Tranzila iframe creation error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create hosted payment page via Cardcom
 */
async function createPaymentPageCardcom(orderData) {
  if (!orderData.amount || !orderData.orderId) {
    return {
      success: false,
      error: 'Amount and orderId are required'
    };
  }

  if (!CONFIG.CARDCOM.CLIENT_ID || !CONFIG.CARDCOM.TERMINAL_ID) {
    return {
      success: false,
      error: 'Cardcom credentials not configured'
    };
  }

  try {
    const requestBody = JSON.stringify({
      clientId: CONFIG.CARDCOM.CLIENT_ID,
      terminalId: CONFIG.CARDCOM.TERMINAL_ID,
      invoiceNr: orderData.orderId,
      sum: orderData.amount,
      currency: '1', // ILS
      email: orderData.customerEmail || '',
      description: orderData.description || 'אישור עירייה'
    });

    const headers = {
      'Authorization': `Bearer ${CONFIG.CARDCOM.AUTHENTICATION_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    };

    const response = await makeRequest(CONFIG.CARDCOM.ENDPOINT, 'POST', requestBody, headers);

    if (response.status !== 200) {
      return {
        success: false,
        error: `Cardcom API error: ${response.status}`
      };
    }

    const result = JSON.parse(response.body);

    if (result.status === 0 || result.isSuccess) {
      return {
        success: true,
        url: result.url || result.pageUrl,
        token: result.TokenId || result.token || '',
        gateway: 'cardcom'
      };
    } else {
      return {
        success: false,
        error: `Failed to create payment page: ${result.statusDescription || 'Unknown error'}`
      };
    }
  } catch (error) {
    console.error('[PAYMENT] Cardcom payment page creation error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create hosted payment page (iframe URL)
 * Allows customer to enter payment details in a hosted form
 */
async function createPaymentPage(orderData) {
  console.log(`[PAYMENT] Creating payment page for order ${orderData.orderId} (${orderData.amount} ILS)`);

  if (CONFIG.PROVIDER === 'cardcom') {
    const result = await createPaymentPageCardcom(orderData);
    if (!result.success) {
      return await createPaymentPageTranzila(orderData);
    }
    return result;
  } else {
    return await createPaymentPageTranzila(orderData);
  }
}

/**
 * Verify Tranzila webhook signature
 */
function verifyTranzilaWebhook(body, signature) {
  if (!signature) return false;

  // Tranzila uses supplier token-based verification
  const expectedSignature = crypto
    .createHash('md5')
    .update(body + CONFIG.TRANZILA.TOKEN)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Handle webhook from payment gateway
 * Processes payment confirmation callbacks
 */
function handleWebhook(body, headers = {}, source = 'tranzila') {
  try {
    if (source === 'tranzila' || !source) {
      // Tranzila webhook verification
      if (headers['x-tranzila-signature']) {
        if (!verifyTranzilaWebhook(JSON.stringify(body), headers['x-tranzila-signature'])) {
          console.warn('[PAYMENT] Invalid Tranzila webhook signature');
          return {
            verified: false,
            error: 'Invalid signature'
          };
        }
      }

      // Parse Tranzila response
      const response = body.Response || body.response;

      if (response === '000') {
        return {
          verified: true,
          orderId: body.order || body.Order,
          transactionId: body.TransID || body.Transact,
          authCode: body.AuthCode,
          status: 'completed',
          amount: body.sum || body.Sum,
          gateway: 'tranzila'
        };
      } else {
        return {
          verified: true,
          orderId: body.order || body.Order,
          status: 'failed',
          errorCode: response,
          gateway: 'tranzila'
        };
      }
    } else if (source === 'cardcom') {
      // Cardcom webhook handling
      // Verify token if provided
      if (headers['x-cardcom-token']) {
        const expectedToken = crypto
          .createHash('sha256')
          .update(JSON.stringify(body) + CONFIG.CARDCOM.AUTHENTICATION_TOKEN)
          .digest('hex');

        if (headers['x-cardcom-token'] !== expectedToken) {
          console.warn('[PAYMENT] Invalid Cardcom webhook signature');
          return {
            verified: false,
            error: 'Invalid signature'
          };
        }
      }

      const isSuccess = body.status === 0 || body.isSuccess === true;

      return {
        verified: true,
        orderId: body.invoiceNr || body.invoiceNumber,
        transactionId: body.transactionId,
        status: isSuccess ? 'completed' : 'failed',
        amount: body.sum,
        gateway: 'cardcom'
      };
    }

    return {
      verified: false,
      error: 'Unknown gateway'
    };
  } catch (error) {
    console.error('[PAYMENT] Webhook processing error:', error.message);
    return {
      verified: false,
      error: error.message
    };
  }
}

/**
 * Process refund via Tranzila
 */
async function processRefundTranzila(transactionId, amount = null) {
  try {
    const params = {
      supplier: CONFIG.TRANZILA.SUPPLIER,
      transact: transactionId,
      sum: amount ? amount.toString() : '', // Empty for full refund
      do: 'refund'
    };

    if (CONFIG.TRANZILA.TOKEN) {
      params.token = CONFIG.TRANZILA.TOKEN;
    }

    const queryStr = querystring.stringify(params);
    const response = await makeRequest(CONFIG.TRANZILA.ENDPOINT, 'POST', queryStr);

    const responseData = querystring.parse(response.body);

    if (responseData.Response === '000') {
      return {
        success: true,
        refundId: responseData.RefID || responseData.TransID,
        transactionId: transactionId,
        gateway: 'tranzila'
      };
    } else {
      return {
        success: false,
        error: responseData.Description || 'Refund failed',
        gateway: 'tranzila'
      };
    }
  } catch (error) {
    console.error('[PAYMENT] Tranzila refund error:', error.message);
    return {
      success: false,
      error: error.message,
      gateway: 'tranzila'
    };
  }
}

/**
 * Process refund via Cardcom
 */
async function processRefundCardcom(transactionId, amount = null) {
  try {
    if (!CONFIG.CARDCOM.CLIENT_ID || !CONFIG.CARDCOM.TERMINAL_ID) {
      return {
        success: false,
        error: 'Cardcom credentials not configured'
      };
    }

    const requestBody = JSON.stringify({
      clientId: CONFIG.CARDCOM.CLIENT_ID,
      terminalId: CONFIG.CARDCOM.TERMINAL_ID,
      transactionId: transactionId,
      refundAmount: amount || 0 // 0 = full refund
    });

    const headers = {
      'Authorization': `Bearer ${CONFIG.CARDCOM.AUTHENTICATION_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const refundEndpoint = CONFIG.CARDCOM.ENDPOINT.replace('/Create', '/Refund');
    const response = await makeRequest(refundEndpoint, 'POST', requestBody, headers);

    if (response.status !== 200) {
      return {
        success: false,
        error: `Cardcom API error: ${response.status}`
      };
    }

    const result = JSON.parse(response.body);

    if (result.status === 0 || result.isSuccess) {
      return {
        success: true,
        refundId: result.refundId,
        transactionId: transactionId,
        gateway: 'cardcom'
      };
    } else {
      return {
        success: false,
        error: result.statusDescription || 'Refund failed',
        gateway: 'cardcom'
      };
    }
  } catch (error) {
    console.error('[PAYMENT] Cardcom refund error:', error.message);
    return {
      success: false,
      error: error.message,
      gateway: 'cardcom'
    };
  }
}

/**
 * Process refund for a transaction
 */
async function processRefund(transactionId, amount = null) {
  console.log(`[PAYMENT] Processing refund for transaction ${transactionId}`);

  if (!transactionId) {
    return {
      success: false,
      error: 'Transaction ID is required'
    };
  }

  if (CONFIG.PROVIDER === 'cardcom') {
    return await processRefundCardcom(transactionId, amount);
  } else {
    return await processRefundTranzila(transactionId, amount);
  }
}

// Export module
module.exports = {
  processPayment,
  createPaymentPage,
  handleWebhook,
  processRefund,
  calculateTotal,
  validatePaymentData,
  maskCardNumber,
  CONFIG
};
