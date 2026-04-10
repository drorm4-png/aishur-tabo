/**
 * אישורטאבו - SQLite Database Layer
 * Database module using sql.js (pure JavaScript SQLite)
 * Manages all persistence for orders, payments, notifications, and audit logs
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Configuration from environment
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'ashurtabo.db');
const DB_DIR = path.dirname(DB_PATH);

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Database singleton
let db = null;
let SQL = null;
let saveTimer = null;

/**
 * Initialize sql.js and load/create database
 * MUST be called (and awaited) before any other database operation
 */
async function initializeDatabase() {
  if (db) return db;

  SQL = await initSqlJs();

  // Load existing database file or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`[DATABASE] Loaded existing database: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`[DATABASE] Created new database: ${DB_PATH}`);
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

/**
 * Save database to disk (debounced)
 */
function saveDatabase() {
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('[DATABASE] Failed to save:', e.message);
    }
  }, 500);
}

/** Force save now (for shutdown) */
function saveDatabaseSync() {
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    console.log('[DATABASE] Saved to disk');
  } catch (e) {
    console.error('[DATABASE] Failed to save:', e.message);
  }
}

/**
 * Create all required tables
 */
function createTables() {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      client_id_number TEXT,
      property_address TEXT NOT NULL,
      parcel_number TEXT,
      block_number TEXT,
      municipality_code TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      payment_status TEXT DEFAULT 'pending',
      submission_method TEXT,
      confirmation_number TEXT,
      documents TEXT,
      transaction_id TEXT,
      notes TEXT,
      seller_name TEXT,
      seller_id TEXT,
      buyer_name TEXT,
      buyer_id TEXT,
      transaction_type TEXT,
      signature_data TEXT,
      terms_accepted INTEGER DEFAULT 0,
      signed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_client_email ON orders(client_email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_client_phone ON orders(client_phone)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_municipality ON orders(municipality_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'ILS',
      provider TEXT NOT NULL,
      transaction_id TEXT,
      status TEXT DEFAULT 'pending',
      payment_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON notifications(order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_order_id ON audit_log(order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);

  saveDatabase();
  console.log('[DATABASE] All tables created successfully');
}

/**
 * Helper: run a SELECT query and return all rows as objects
 */
function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Helper: run a SELECT query and return first row as object
 */
function queryOne(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

/**
 * Helper: run an INSERT/UPDATE/DELETE
 */
function execute(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveDatabase();
}

/**
 * Get database connection (singleton)
 */
function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call and await initializeDatabase() first.');
  return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    saveDatabaseSync();
    db.close();
    db = null;
    console.log('[DATABASE] Connection closed');
  }
}

// ============ ORDERS CRUD ============

function createOrder(orderData) {
  const {
    id, client_name, client_email, client_phone, client_id_number = null,
    property_address, parcel_number = null, block_number = null,
    municipality_code, status = 'new', payment_status = 'pending',
    submission_method = null, confirmation_number = null, documents = null,
    transaction_id = null, notes = '', seller_name = null, seller_id = null,
    buyer_name = null, buyer_id = null, transaction_type = null,
    signature_data = null, terms_accepted = false, signed_at = null
  } = orderData;

  execute(`
    INSERT INTO orders (
      id, client_name, client_email, client_phone, client_id_number,
      property_address, parcel_number, block_number, municipality_code,
      status, payment_status, submission_method, confirmation_number,
      documents, transaction_id, notes, seller_name, seller_id,
      buyer_name, buyer_id, transaction_type, signature_data,
      terms_accepted, signed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, client_name, client_email, client_phone, client_id_number,
    property_address, parcel_number, block_number, municipality_code,
    status, payment_status, submission_method, confirmation_number,
    documents ? JSON.stringify(documents) : null, transaction_id, notes,
    seller_name, seller_id, buyer_name, buyer_id, transaction_type,
    signature_data, terms_accepted ? 1 : 0, signed_at
  ]);

  return getOrderById(id);
}

function getOrderById(orderId) {
  const row = queryOne('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL', [orderId]);
  return normalizeOrder(row);
}

function getOrdersByEmail(email) {
  return queryAll('SELECT * FROM orders WHERE client_email = ? AND deleted_at IS NULL ORDER BY created_at DESC', [email]).map(normalizeOrder);
}

function getOrdersByPhone(phone) {
  return queryAll('SELECT * FROM orders WHERE client_phone LIKE ? AND deleted_at IS NULL ORDER BY created_at DESC', [`%${phone}%`]).map(normalizeOrder);
}

function getOrdersByStatus(status) {
  return queryAll('SELECT * FROM orders WHERE status = ? AND deleted_at IS NULL ORDER BY created_at DESC', [status]).map(normalizeOrder);
}

function getOrdersByMunicipality(municipalityCode) {
  return queryAll('SELECT * FROM orders WHERE municipality_code = ? AND deleted_at IS NULL ORDER BY created_at DESC', [municipalityCode]).map(normalizeOrder);
}

function getRecentOrders(limit = 50) {
  return queryAll('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?', [limit]).map(normalizeOrder);
}

function getAllOrders(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const countRow = queryOne('SELECT COUNT(*) as count FROM orders WHERE deleted_at IS NULL');
  const count = countRow ? countRow.count : 0;
  const orders = queryAll('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]).map(normalizeOrder);

  return {
    data: orders,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    }
  };
}

function updateOrder(orderId, updates) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(key === 'documents' && value ? JSON.stringify(value) : value);
  }

  if (fields.length === 0) return getOrderById(orderId);

  fields.push("updated_at = datetime('now')");
  execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, [...values, orderId]);
  return getOrderById(orderId);
}

function updateOrderStatus(orderId, status, notes = null) {
  return updateOrder(orderId, { status, ...(notes && { notes }) });
}

function deleteOrder(orderId) {
  execute("UPDATE orders SET deleted_at = datetime('now') WHERE id = ?", [orderId]);
}

function getOrderStats() {
  const total = queryOne('SELECT COUNT(*) as count FROM orders WHERE deleted_at IS NULL');
  const byStatus = (s) => queryOne(`SELECT COUNT(*) as count FROM orders WHERE status = ? AND deleted_at IS NULL`, [s]);
  const byPayment = (s) => queryOne(`SELECT COUNT(*) as count FROM orders WHERE payment_status = ? AND deleted_at IS NULL`, [s]);

  return {
    total: total ? total.count : 0,
    new: byStatus('new')?.count || 0,
    paid: byStatus('paid')?.count || 0,
    processing: byStatus('processing')?.count || 0,
    submitted: byStatus('submitted')?.count || 0,
    completed: byStatus('completed')?.count || 0,
    failed: byStatus('failed')?.count || 0,
    paymentPending: byPayment('pending')?.count || 0,
    paymentCompleted: byPayment('completed')?.count || 0
  };
}

// ============ PAYMENTS CRUD ============

function createPayment(paymentData) {
  const { id, order_id, amount, currency = 'ILS', provider, transaction_id = null, status = 'pending', payment_data = null } = paymentData;

  execute(`
    INSERT INTO payments (id, order_id, amount, currency, provider, transaction_id, status, payment_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, order_id, amount, currency, provider, transaction_id, status, payment_data ? JSON.stringify(payment_data) : null]);

  return getPaymentById(id);
}

function getPaymentById(paymentId) {
  const row = queryOne('SELECT * FROM payments WHERE id = ?', [paymentId]);
  return normalizePayment(row);
}

function getPaymentsByOrderId(orderId) {
  return queryAll('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC', [orderId]).map(normalizePayment);
}

function updatePayment(paymentId, updates) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(key === 'payment_data' && value ? JSON.stringify(value) : value);
  }

  if (fields.length === 0) return getPaymentById(paymentId);

  fields.push("updated_at = datetime('now')");
  execute(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, [...values, paymentId]);
  return getPaymentById(paymentId);
}

// ============ NOTIFICATIONS CRUD ============

function createNotification(notificationData) {
  const { id, order_id, type, recipient, subject = null, content, status = 'pending' } = notificationData;

  execute(`
    INSERT INTO notifications (id, order_id, type, recipient, subject, content, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, order_id, type, recipient, subject, content, status]);

  return getNotificationById(id);
}

function getNotificationById(notificationId) {
  return queryOne('SELECT * FROM notifications WHERE id = ?', [notificationId]);
}

function getNotificationsByOrderId(orderId) {
  return queryAll('SELECT * FROM notifications WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
}

function getPendingNotifications() {
  return queryAll("SELECT * FROM notifications WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
}

function updateNotificationStatus(notificationId, status) {
  execute("UPDATE notifications SET status = ?, sent_at = datetime('now') WHERE id = ?", [status, notificationId]);
  return getNotificationById(notificationId);
}

// ============ AUDIT LOG ============

function logAudit(orderId, action, details = null) {
  const id = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  execute(`INSERT INTO audit_log (id, order_id, action, details) VALUES (?, ?, ?, ?)`,
    [id, orderId, action, details ? JSON.stringify(details) : null]);
}

function getAuditLog(orderId, limit = 100) {
  return queryAll('SELECT * FROM audit_log WHERE order_id = ? ORDER BY created_at DESC LIMIT ?', [orderId, limit]).map(normalizeAuditLog);
}

// ============ HELPERS ============

function normalizeOrder(row) {
  if (!row) return null;
  return {
    ...row,
    documents: row.documents ? JSON.parse(row.documents) : null,
    terms_accepted: Boolean(row.terms_accepted)
  };
}

function normalizePayment(row) {
  if (!row) return null;
  return {
    ...row,
    payment_data: row.payment_data ? JSON.parse(row.payment_data) : null
  };
}

function normalizeAuditLog(row) {
  if (!row) return null;
  return {
    ...row,
    details: row.details ? JSON.parse(row.details) : null
  };
}

/**
 * Run database migrations and initialize
 * Call this on application startup (async!)
 */
async function migrate() {
  console.log('[DATABASE] Initializing database...');
  await initializeDatabase();
  createTables();
  console.log('[DATABASE] Migration complete');
}

// ============ MODULE EXPORTS ============

module.exports = {
  migrate,
  getDatabase,
  closeDatabase,
  initializeDatabase,
  createTables,
  saveDatabaseSync,

  // Orders
  createOrder,
  getOrderById,
  getOrdersByEmail,
  getOrdersByPhone,
  getOrdersByStatus,
  getOrdersByMunicipality,
  getRecentOrders,
  getAllOrders,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderStats,

  // Payments
  createPayment,
  getPaymentById,
  getPaymentsByOrderId,
  updatePayment,

  // Notifications
  createNotification,
  getNotificationById,
  getNotificationsByOrderId,
  getPendingNotifications,
  updateNotificationStatus,

  // Audit
  logAudit,
  getAuditLog,

  // Internal helpers (for modules that need raw queries)
  queryAll,
  queryOne,
  execute
};
