/**
 * Monitoring Module for אישורטאבו
 * Health checks, error tracking, performance monitoring, alerting
 */

const os = require('os');
const db = require('./database');

// Configuration
const CONFIG = {
  ERROR_RATE_THRESHOLD: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.05'), // 5% errors
  ALERT_EMAIL: process.env.ALERT_EMAIL || 'admin@ishurutabu.co.il',
  ENABLE_ALERTS: process.env.ENABLE_ALERTS !== 'false'
};

// Monitoring state
const metrics = {
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  endpointStats: {}, // endpoint -> { count, errors, avgResponseTime, lastError }
  lastOrderTime: null,
  lastCheckTime: Date.now(),
  dailySummary: {
    date: new Date().toISOString().split('T')[0],
    totalRequests: 0,
    totalErrors: 0,
    endpointsHit: 0
  }
};

const errorLog = [];
const performanceLog = [];

/**
 * Health check endpoint data
 */
function healthCheck() {
  const uptime = Date.now() - metrics.startTime;
  const memUsage = process.memoryUsage();

  try {
    const stats = db.getOrderStats();
    const recentOrders = db.getRecentOrders(1);
    const lastOrderTime = recentOrders.length > 0
      ? new Date(recentOrders[0].created_at).toISOString()
      : null;

    const errorRate = metrics.requestCount > 0
      ? metrics.errorCount / metrics.requestCount
      : 0;

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      database: {
        orders: stats.total,
        processing: stats.processing,
        completed: stats.completed,
        failed: stats.failed,
        lastOrderTime
      },
      api: {
        totalRequests: metrics.requestCount,
        totalErrors: metrics.errorCount,
        errorRate: errorRate.toFixed(4),
        endpoints: Object.keys(metrics.endpointStats).length
      },
      system: {
        cpu: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024), // MB
        available: Math.round(os.freemem() / 1024 / 1024)
      }
    };

    // Check thresholds
    if (errorRate > CONFIG.ERROR_RATE_THRESHOLD) {
      health.status = 'degraded';
    }

    if (memUsage.heapUsed > memUsage.heapTotal * 0.9) {
      health.status = 'degraded';
    }

    return health;
  } catch (err) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message,
      uptime
    };
  }
}

/**
 * Track error with context
 */
function trackError(error, context = {}) {
  const errorRecord = {
    timestamp: new Date().toISOString(),
    message: error.message || String(error),
    stack: error.stack,
    context,
    level: 'error'
  };

  errorLog.push(errorRecord);

  // Keep last 1000 errors in memory
  if (errorLog.length > 1000) {
    errorLog.shift();
  }

  metrics.errorCount++;

  // Update daily summary
  metrics.dailySummary.totalErrors++;

  // Check if alert threshold exceeded
  if (CONFIG.ENABLE_ALERTS) {
    const recentErrors = errorLog.filter(e => {
      const ageMs = Date.now() - new Date(e.timestamp).getTime();
      return ageMs < 60000; // Last 1 minute
    });

    if (recentErrors.length >= 10) {
      // Trigger alert (in production would send email)
      const alert = {
        timestamp: new Date().toISOString(),
        type: 'high_error_rate',
        recentErrors: recentErrors.length,
        threshold: 10,
        action: 'Alert threshold exceeded'
      };

      console.error('[MONITORING] ALERT:', JSON.stringify(alert));
    }
  }

  return errorRecord;
}

/**
 * Track API request and response
 */
function trackRequest(method, path, statusCode, responseTimeMs, error = null) {
  metrics.requestCount++;
  metrics.dailySummary.totalRequests++;

  const endpointKey = `${method} ${path}`;

  if (!metrics.endpointStats[endpointKey]) {
    metrics.endpointStats[endpointKey] = {
      count: 0,
      errors: 0,
      totalTime: 0,
      avgResponseTime: 0,
      minTime: Infinity,
      maxTime: 0,
      lastCalled: null,
      lastError: null
    };
    metrics.dailySummary.endpointsHit++;
  }

  const stats = metrics.endpointStats[endpointKey];
  stats.count++;
  stats.totalTime += responseTimeMs;
  stats.avgResponseTime = Math.round(stats.totalTime / stats.count);
  stats.minTime = Math.min(stats.minTime, responseTimeMs);
  stats.maxTime = Math.max(stats.maxTime, responseTimeMs);
  stats.lastCalled = new Date().toISOString();

  if (statusCode >= 400) {
    stats.errors++;
    stats.lastError = {
      code: statusCode,
      timestamp: new Date().toISOString(),
      message: error ? error.message : null
    };
  }

  // Log performance
  performanceLog.push({
    timestamp: new Date().toISOString(),
    method,
    path,
    statusCode,
    responseTimeMs,
    error: error ? error.message : null
  });

  if (performanceLog.length > 10000) {
    performanceLog.shift();
  }
}

/**
 * Get current metrics
 */
function getMetrics() {
  const health = healthCheck();

  return {
    health,
    metrics: {
      requests: metrics.requestCount,
      errors: metrics.errorCount,
      errorRate: (metrics.errorCount / Math.max(metrics.requestCount, 1)).toFixed(4),
      endpoints: metrics.endpointStats,
      uptime: Date.now() - metrics.startTime,
      startTime: new Date(metrics.startTime).toISOString()
    },
    recentErrors: errorLog.slice(-20),
    dailySummary: metrics.dailySummary,
    topEndpoints: Object.entries(metrics.endpointStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([endpoint, stats]) => ({
        endpoint,
        ...stats
      }))
  };
}

/**
 * Generate daily stats summary
 */
function generateDailySummary() {
  const summary = {
    date: new Date().toISOString(),
    period: '24 hours',
    requests: {
      total: metrics.dailySummary.totalRequests,
      errors: metrics.dailySummary.totalErrors
    },
    database: {
      orders: (() => { try { return db.getOrderStats(); } catch(e) { return {}; } })()
    },
    endpoints: {
      total: metrics.dailySummary.endpointsHit,
      stats: Object.entries(metrics.endpointStats)
        .map(([endpoint, stats]) => ({
          endpoint,
          calls: stats.count,
          errors: stats.errors,
          avgResponseTime: stats.avgResponseTime,
          lastError: stats.lastError
        }))
        .sort((a, b) => b.calls - a.calls)
    },
    topErrors: errorLog
      .slice(-100)
      .reduce((acc, err) => {
        const existing = acc.find(e => e.message === err.message);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ message: err.message, count: 1, lastSeen: err.timestamp });
        }
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    health: healthCheck()
  };

  // Log summary
  console.log('[MONITORING] Daily Summary:', JSON.stringify(summary, null, 2));

  return summary;
}

/**
 * Express middleware for request/response tracking
 */
function monitoringMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();

    // Intercept res.end to capture response details
    const originalEnd = res.end;
    res.end = function(...args) {
      const responseTime = Date.now() - startTime;
      trackRequest(req.method, req.path, res.statusCode, responseTime);
      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Express middleware for error handler
 */
function errorTrackingMiddleware() {
  return (err, req, res, next) => {
    trackError(err, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next(err);
  };
}

/**
 * Setup process-level error handlers
 */
function setupProcessErrorHandlers() {
  process.on('uncaughtException', (error) => {
    console.error('[MONITORING] Uncaught Exception:', error);
    trackError(error, {
      type: 'uncaughtException',
      fatal: true
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[MONITORING] Unhandled Rejection:', reason);
    trackError(
      reason instanceof Error ? reason : new Error(String(reason)),
      {
        type: 'unhandledRejection',
        promise: promise.toString()
      }
    );
  });
}

module.exports = {
  healthCheck,
  trackError,
  trackRequest,
  getMetrics,
  generateDailySummary,
  monitoringMiddleware,
  errorTrackingMiddleware,
  setupProcessErrorHandlers
};
