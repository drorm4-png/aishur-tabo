const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const router = express.Router();

// ===== CLIENT ENDPOINTS =====

/**
 * POST /api/client/lookup
 * Look up order by ID and phone/email
 */
router.post('/lookup', (req, res) => {
  try {
    const { orderId, phone, email } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'phone or email is required'
      });
    }

    const order = db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Verify ownership (phone or email match)
    const phoneMatch = phone && order.client_phone.includes(phone.replace(/\D/g, ''));
    const emailMatch = email && order.client_email.toLowerCase() === email.toLowerCase();

    if (!phoneMatch && !emailMatch) {
      return res.status(403).json({
        success: false,
        error: 'Phone or email does not match'
      });
    }

    // Return order details (limited fields for security)
    const safeOrder = {
      id: order.id,
      sellerName: order.seller_name,
      buyerName: order.buyer_name,
      phone: order.client_phone,
      email: order.client_email,
      propertyAddress: order.property_address,
      municipality: order.municipality_code,
      block: order.block_number,
      parcel: order.parcel_number,
      transactionType: order.transaction_type,
      status: order.status,
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };

    res.json({
      success: true,
      data: safeOrder
    });
  } catch (err) {
    console.error('Error looking up order:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to look up order'
    });
  }
});

/**
 * GET /api/client/order/:id/documents
 * Get downloadable documents for an order
 * Must verify ownership with phone/email query params
 */
router.get('/order/:id/documents', (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { phone, email } = req.query;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'phone or email required for verification'
      });
    }

    const order = db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Verify ownership
    const phoneMatch = phone && order.client_phone.includes(phone.replace(/\D/g, ''));
    const emailMatch = email && order.client_email.toLowerCase() === email.toLowerCase();

    if (!phoneMatch && !emailMatch) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Build document list based on order status
    const documents = [];

    // POA is available after paid status
    if (order.payment_status === 'completed' || order.status !== 'new') {
      const poaFileName = `poa-${order.id}.pdf`;
      const poaPath = path.join(__dirname, 'uploads', poaFileName);

      documents.push({
        id: 'poa',
        name: 'ייפוי כוח',
        type: 'PDF',
        available: fs.existsSync(poaPath),
        downloadUrl: `/api/uploads/${poaFileName}`,
        createdAt: order.created_at
      });
    }

    // Final approval certificate available when completed
    if (order.status === 'completed') {
      const certFileName = `approval-${order.id}.pdf`;
      const certPath = path.join(__dirname, 'uploads', certFileName);

      documents.push({
        id: 'approval',
        name: 'אישור עירייה',
        type: 'PDF',
        available: fs.existsSync(certPath),
        downloadUrl: `/api/uploads/${certFileName}`,
        createdAt: order.updated_at
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        documents: documents
      }
    });
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
});

/**
 * POST /api/client/order/:id/feedback
 * Submit feedback/notes on order (optional)
 */
router.post('/order/:id/feedback', (req, res) => {
  try {
    const { orderId } = req.params;
    const { phone, email, feedback } = req.body;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'phone or email required for verification'
      });
    }

    if (!feedback) {
      return res.status(400).json({
        success: false,
        error: 'feedback is required'
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

    // Verify ownership
    const phoneMatch = phone && order.phone.includes(phone.replace(/\D/g, ''));
    const emailMatch = email && order.email.toLowerCase() === email.toLowerCase();

    if (!phoneMatch && !emailMatch) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Log feedback (in real app, save to database)
    console.log(`[FEEDBACK] Order ${orderId}: ${feedback}`);

    res.json({
      success: true,
      message: 'Thank you for your feedback'
    });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
});

module.exports = router;
