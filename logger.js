/**
 * Structured Logging Module for אישורטאבו
 * JSON logging, rotating files, log levels, request logging
 */

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const LOG_LEVEL_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
  4: 'CRITICAL'
};

// Current log level threshold (minimum level to log)
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

// Configuration
const CONFIG = {
  MAX_FILE_SIZE: parseInt(process.env.LOG_FILE_SIZE || '10485760'), // 10MB default
  LOG_FILES: {
    APP: path.join(logsDir, 'app.log'),
    ERROR: path.join(logsDir, 'error.log'),
    REQUEST: path.join(logsDir, 'request.log')
  },
  SENSITIVE_FIELDS: [
    'password',
    'token',
    'card_number',
    'cvv',
    'secret',
    'apiKey',
    'authToken',
    'creditCard'
  ]
};

// File stream management
let fileStreams = {};

/**
 * Rotate log file if needed
 */
function rotateLogFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const stats = fs.statSync(filePath);
    if (stats.size > CONFIG.MAX_FILE_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      const newPath = path.join(dir, `${baseName}-${timestamp}${ext}`);

      fs.renameSync(filePath, newPath);
      console.log(`[LOGGER] Rotated log file: ${filePath} -> ${newPath}`);
    }
  } catch (err) {
    console.error('[LOGGER] Error rotating log file:', err.message);
  }
}

/**
 * Get or create file stream for log file
 */
function getFileStream(filePath) {
  if (!fileStreams[filePath]) {
    rotateLogFile(filePath);
    fileStreams[filePath] = fs.createWriteStream(filePath, { flags: 'a' });
  }
  return fileStreams[filePath];
}

/**
 * Redact sensitive information from object
 */
function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted = JSON.parse(JSON.stringify(obj));

  function redactRecursive(target) {
    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();

        // Check if key matches sensitive field names
        if (CONFIG.SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
          target[key] = '[REDACTED]';
        } else if (typeof target[key] === 'object' && target[key] !== null) {
          redactRecursive(target[key]);
        }
      }
    }
  }

  redactRecursive(redacted);
  return redacted;
}

/**
 * Format log entry as JSON line
 */
function formatLogEntry(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: LOG_LEVEL_NAMES[level],
    message,
    context: redactSensitiveData(context),
    pid: process.pid,
    hostname: require('os').hostname()
  };

  return JSON.stringify(entry);
}

/**
 * Write log to file and console
 */
function writeLog(level, message, context = {}, targetFile = CONFIG.LOG_FILES.APP) {
  // Check if we should log this level
  if (level < CURRENT_LOG_LEVEL) {
    return;
  }

  const logEntry = formatLogEntry(level, message, context);

  // Write to console
  const consoleOutput = `[${LOG_LEVEL_NAMES[level]}] ${message}`;
  if (level >= LOG_LEVELS.ERROR) {
    console.error(consoleOutput);
  } else if (level >= LOG_LEVELS.WARN) {
    console.warn(consoleOutput);
  } else {
    console.log(consoleOutput);
  }

  // Write to file
  try {
    const stream = getFileStream(targetFile);
    stream.write(logEntry + '\n');
  } catch (err) {
    console.error('[LOGGER] Error writing to log file:', err.message);
  }

  // Also write errors to error.log
  if (level >= LOG_LEVELS.ERROR && targetFile !== CONFIG.LOG_FILES.ERROR) {
    try {
      const errorStream = getFileStream(CONFIG.LOG_FILES.ERROR);
      errorStream.write(logEntry + '\n');
    } catch (err) {
      console.error('[LOGGER] Error writing to error log:', err.message);
    }
  }
}

/**
 * Logger object with methods for each level
 */
const logger = {
  debug: (message, context = {}) => writeLog(LOG_LEVELS.DEBUG, message, context),
  info: (message, context = {}) => writeLog(LOG_LEVELS.INFO, message, context),
  warn: (message, context = {}) => writeLog(LOG_LEVELS.WARN, message, context),
  error: (message, context = {}) => writeLog(LOG_LEVELS.ERROR, message, context),
  critical: (message, context = {}) => {
    writeLog(LOG_LEVELS.CRITICAL, message, context);
    // Critical errors should also trigger alerts
    console.error('[CRITICAL ALERT]', message, context);
  }
};

/**
 * Express middleware for request logging
 */
function requestLogger() {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log request
    logger.debug(`Incoming ${req.method} request`, {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      query: req.query
    });

    // Store request ID for error handling
    res.locals.requestId = requestId;

    // Intercept response end
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;

      // Log response
      if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.path} - ${res.statusCode}`, {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip: req.ip
        });
      } else {
        logger.debug(`${req.method} ${req.path} - ${res.statusCode}`, {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration
        });
      }

      // Write to request log
      const logEntry = formatLogEntry(
        res.statusCode >= 400 ? LOG_LEVELS.WARN : LOG_LEVELS.INFO,
        `${req.method} ${req.path} ${res.statusCode}`,
        {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip: req.ip
        }
      );

      try {
        const stream = getFileStream(CONFIG.LOG_FILES.REQUEST);
        stream.write(logEntry + '\n');
      } catch (err) {
        console.error('[LOGGER] Error writing to request log:', err.message);
      }

      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Express error logging middleware
 */
function errorLoggingMiddleware() {
  return (err, req, res, next) => {
    const requestId = res.locals.requestId || 'unknown';

    logger.error(err.message, {
      requestId,
      error: {
        message: err.message,
        stack: err.stack,
        code: err.code
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip
      }
    });

    next(err);
  };
}

/**
 * Close all log file streams
 */
function closeStreams() {
  for (const filePath in fileStreams) {
    if (fileStreams[filePath]) {
      fileStreams[filePath].end();
    }
  }
  console.log('[LOGGER] All log streams closed');
}

/**
 * Cleanup on process exit
 */
function setupCleanup() {
  process.on('exit', closeStreams);
  process.on('SIGINT', closeStreams);
  process.on('SIGTERM', closeStreams);
}

setupCleanup();

module.exports = {
  logger,
  requestLogger,
  errorLoggingMiddleware,
  closeStreams,
  LOG_LEVELS,
  CONFIG
};
