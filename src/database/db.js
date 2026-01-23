/**
 * Database Operations using sql.js (pure JavaScript SQLite)
 * CRUD operations สำหรับจัดการข้อมูลการสั่งคอนกรีต
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { SCHEMA } = require('./schema');

// สร้าง data directory ถ้ายังไม่มี (รองรับ DATA_DIR หรือ DB_PATH สำหรับ production)
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, 'orders.db');

let db = null;
let isInitialized = false;
const SUMMARY_GROUPS = {
  factory: 'factory_id',
  product: 'product_code'
};

/**
 * Initialize database
 */
async function initDatabase() {
  if (isInitialized) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('✅ Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('✅ Created new database');
  }

  // Initialize schema
  db.run(SCHEMA);
  saveDatabase();

  isInitialized = true;
  return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * บันทึกคำสั่งซื้อคอนกรีตใหม่
 * @param {Object} order 
 * @returns {Object} inserted order with id
 */
function insertOrder(order) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO concrete_orders (
      order_date, factory_id, product_code, product_detail,
      cement_quantity, loaded_quantity, difference,
      supervisor, notes, raw_message,
      line_user_id, line_group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    order.orderDate || null,
    order.factoryId || null,
    order.productCode || null,
    order.productDetail || null,
    order.cementQuantity || null,
    order.loadedQuantity || null,
    order.difference || null,
    order.supervisor || null,
    order.notes || null,
    order.rawMessage || null,
    order.lineUserId || null,
    order.lineGroupId || null
  ]);
  stmt.free();

  // Get last insert id
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0]?.values[0][0];

  saveDatabase();

  return { id, ...order };
}

/**
 * ดึงคำสั่งซื้อที่ยังไม่ได้ sync ไป Google Sheets
 * @returns {Array} orders
 */
function getUnsyncedOrders() {
  if (!db) return [];

  const results = db.exec(`
    SELECT * FROM concrete_orders 
    WHERE synced_to_sheets = 0
    ORDER BY created_at ASC
  `);

  return formatResults(results);
}

/**
 * อัพเดทสถานะ sync
 * @param {Array<number>} ids 
 */
function markAsSynced(ids) {
  if (!db || !ids || ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(',');
  db.run(`
    UPDATE concrete_orders 
    SET synced_to_sheets = 1 
    WHERE id IN (${placeholders})
  `, ids);

  saveDatabase();
}

/**
 * ดึงคำสั่งซื้อตามวันที่
 * @param {string} date - วันที่ในรูปแบบ YYYY-MM-DD
 * @returns {Array}
 */
function getOrdersByDate(date) {
  if (!db) return [];

  const results = db.exec(`
    SELECT * FROM concrete_orders 
    WHERE order_date = ?
    ORDER BY created_at ASC
  `, [date]);

  return formatResults(results);
}

/**
 * ดึงคำสั่งซื้อตามโรงงาน
 * @param {number} factoryId 
 * @returns {Array}
 */
function getOrdersByFactory(factoryId) {
  if (!db) return [];

  const results = db.exec(`
    SELECT * FROM concrete_orders 
    WHERE factory_id = ?
    ORDER BY created_at DESC
  `, [factoryId]);

  return formatResults(results);
}

/**
 * ดึงสถิติรายวัน
 * @param {string} date 
 * @returns {Array}
 */
function getDailySummary(date) {
  if (!db) return [];

  const results = db.exec(`
    SELECT 
      factory_id,
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement
    FROM concrete_orders 
    WHERE order_date = ?
    GROUP BY factory_id
    ORDER BY factory_id
  `, [date]);

  return formatResults(results);
}

/**
 * ดึงสรุปรายวันตามกลุ่ม (โรงงานหรือกลุ่มสินค้า)
 * @param {string} date
 * @param {'factory'|'product'} groupBy
 * @returns {Array}
 */
function getSummaryByDate(date, groupBy = 'factory') {
  if (!db || !date) return [];

  const column = SUMMARY_GROUPS[groupBy];
  if (!column) return [];

  const results = db.exec(`
    SELECT 
      ${column} as group_key,
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement
    FROM concrete_orders
    WHERE order_date = ?
    GROUP BY ${column}
    ORDER BY total_cement DESC
  `, [date]);

  return formatResults(results);
}

/**
 * ดึงสรุปรายเดือนตามกลุ่ม (โรงงานหรือกลุ่มสินค้า)
 * @param {string} month - YYYY-MM
 * @param {'factory'|'product'} groupBy
 * @returns {Array}
 */
function getSummaryByMonth(month, groupBy = 'factory') {
  if (!db || !month) return [];

  const column = SUMMARY_GROUPS[groupBy];
  if (!column) return [];

  const monthPattern = `${month}-%`;
  const results = db.exec(`
    SELECT 
      ${column} as group_key,
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement
    FROM concrete_orders
    WHERE order_date LIKE ?
    GROUP BY ${column}
    ORDER BY total_cement DESC
  `, [monthPattern]);

  return formatResults(results);
}

/**
 * ดึงคำสั่งซื้อทั้งหมด (พร้อม pagination)
 * @param {number} limit 
 * @param {number} offset 
 * @returns {Array}
 */
function getAllOrders(limit = 100, offset = 0) {
  if (!db) return [];

  const results = db.exec(`
    SELECT * FROM concrete_orders 
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  return formatResults(results);
}

/**
 * นับจำนวน order ทั้งหมด
 * @returns {number}
 */
function getOrderCount() {
  if (!db) return 0;

  const results = db.exec('SELECT COUNT(*) as count FROM concrete_orders');
  return results[0]?.values[0][0] || 0;
}

/**
 * แปลง sql.js results เป็น array of objects
 */
function formatResults(results) {
  if (!results || results.length === 0) return [];

  const columns = results[0].columns;
  const values = results[0].values;

  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

module.exports = {
  initDatabase,
  insertOrder,
  getUnsyncedOrders,
  markAsSynced,
  getOrdersByDate,
  getOrdersByFactory,
  getDailySummary,
  getSummaryByDate,
  getSummaryByMonth,
  getAllOrders,
  getOrderCount
};
