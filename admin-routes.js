const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const router = express.Router();

// Helper: Check admin authorization
function isAdmin(req) {
  const adminPassword = req.headers['x-admin-password'] || req.query.adminPassword;
  return adminPassword === process.env.ADMIN_PASSWORD;
}

// ===== ADMIN ENDPOINTS =====

/**
 * GET /api/admin/stats
 * Dashboard stats (admin only)
 */
router.get('/stats', (req, res) => {
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
router.get('/orders', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { status, paymentStatus, municipality, search } = req.query;
    let orders = [];

    // Fetch orders based on filters
    if (status) {
      orders = db.getOrdersByStatus(status);
    } else if (municipality) {
      orders = db.getOrdersByMunicipality(municipality);
    } else {
      const result = db.getAllOrders(1, 1000); // Get up to 1000 orders
      orders = result.orders || [];
    }

    // Client-side filter by payment status
    if (paymentStatus) {
      orders = orders.filter(o => o.payment_status === paymentStatus);
    }

    // Client-side filter by search
    if (search) {
      orders = orders.filter(o =>
        (o.client_name && o.client_name.includes(search)) ||
        (o.client_phone && o.client_phone.includes(search)) ||
        (o.client_email && o.client_email.includes(search))
      );
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
 * GET /api/admin/orders/:id
 * Single order details (admin only)
 */
router.get('/orders/:id', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const order = db.getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

/**
 * PUT /api/admin/orders/:id/status
 * Update order status (admin only)
 */
router.put('/orders/:id/status', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { status, notes } = req.body;
    const validStatuses = ['new', 'paid', 'processing', 'submitted', 'completed', 'rejected', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = db.updateOrderStatus(req.params.id, status, notes);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Log the status change
    db.logAudit(req.params.id, 'status_changed', { previousStatus: status, notes });

    res.json({
      success: true,
      message: 'Order status updated',
      data: order
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

/**
 * POST /api/admin/orders/:id/retry
 * Retry failed submission (admin only)
 */
router.post('/orders/:id/retry', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const order = db.updateOrderStatus(req.params.id, 'processing', 'Retry initiated by admin');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    db.logAudit(req.params.id, 'retry_initiated', { action: 'admin_retry' });

    res.json({
      success: true,
      message: 'Retry initiated',
      data: order
    });
  } catch (err) {
    console.error('Error retrying order:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retry order'
    });
  }
});

/**
 * POST /api/admin/orders/:id/refund
 * Process refund (admin only)
 */
router.post('/orders/:id/refund', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const order = db.getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (order.payment_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Only paid orders can be refunded'
      });
    }

    // Update payment status to refunded
    const updatedOrder = db.updateOrder(req.params.id, { payment_status: 'refunded' });

    // Create refund payment record
    if (order.transaction_id) {
      db.createPayment({
        order_id: req.params.id,
        amount: -order.amount, // Negative amount for refund
        status: 'refunded',
        method: 'refund',
        transaction_id: 'REFUND-' + order.transaction_id
      });
    }

    db.logAudit(req.params.id, 'refund_processed', { originalTransaction: order.transaction_id });

    res.json({
      success: true,
      message: 'Refund processed',
      data: updatedOrder
    });
  } catch (err) {
    console.error('Error processing refund:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund'
    });
  }
});

/**
 * GET /api/admin/municipalities
 * Municipalities with stats (admin only)
 */
router.get('/municipalities', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { municipalities } = require('./municipalities');

    const municipalitiesWithStats = municipalities.map(m => {
      const muniOrders = db.getOrdersByMunicipality(m.id || m.name);
      const completed = muniOrders.filter(o => o.status === 'completed').length;
      const total = muniOrders.length;

      return {
        ...m,
        orderCount: total,
        completedCount: completed,
        successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        lastUsed: muniOrders.length > 0
          ? muniOrders[0].updated_at
          : null
      };
    }).sort((a, b) => b.orderCount - a.orderCount);

    res.json({
      success: true,
      data: municipalitiesWithStats,
      count: municipalitiesWithStats.length
    });
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch municipalities'
    });
  }
});

/**
 * GET /api/admin/revenue
 * Revenue data for charts (admin only)
 */
router.get('/revenue', (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const period = req.query.period || 'daily'; // daily, weekly, monthly

    let data = {};

    if (period === 'daily') {
      // Last 7 days
      const daysData = {};
      const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        daysData[dateStr] = 0;
      }

      // Get paid orders
      const paidOrders = db.getOrdersByStatus('paid');
      paidOrders.forEach(o => {
        const dateStr = new Date(o.created_at).toDateString();
        if (dateStr in daysData) {
          daysData[dateStr] += 300; // Mock: 300 NIS per order
        }
      });

      data = {
        labels: days,
        data: days.map((_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - i);
          return daysData[date.toDateString()] || 0;
        }).reverse()
      };
    } else if (period === 'weekly') {
      // Last 4 weeks
      const weeksData = [0, 0, 0, 0];
      const paidOrders = db.getOrdersByStatus('paid');
      paidOrders.forEach(o => {
        const createdDate = new Date(o.created_at);
        const daysAgo = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(daysAgo / 7);
        if (weekIndex < 4) {
          weeksData[3 - weekIndex] += 300;
        }
      });

      data = {
        labels: ['שבוע 4', 'שבוע 3', 'שבוע 2', 'שבוע 1'],
        data: weeksData
      };
    } else if (period === 'monthly') {
      // Last 6 months
      const monthsData = [0, 0, 0, 0, 0, 0];
      const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];
      const paidOrders = db.getOrdersByStatus('paid');

      paidOrders.forEach(o => {
        const createdDate = new Date(o.created_at);
        const monthsAgo = (new Date().getFullYear() - createdDate.getFullYear()) * 12 +
                         (new Date().getMonth() - createdDate.getMonth());
        if (monthsAgo < 6) {
          monthsData[5 - monthsAgo] += 300;
        }
      });

      data = {
        labels: monthNames,
        data: monthsData
      };
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Error fetching revenue:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue data'
    });
  }
});

module.exports = router;
