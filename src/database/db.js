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
  product: 'product_code',
  supervisor: 'supervisor'
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
 * บันทึกสั่งคอนกรีตคอนกรีตใหม่
 * @param {Object} order 
 * @returns {Object} inserted order with id
 */
function insertOrder(order) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO concrete_orders (
      order_date, factory_id, product_code, product_detail,
      product_quantity, product_unit,
      cement_quantity, loaded_quantity, difference,
      supervisor, notes, raw_message,
      line_user_id, line_group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    order.orderDate || null,
    order.factoryId || null,
    order.productCode || null,
    order.productDetail || null,
    order.productQuantity || null,
    order.productUnit || null,
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
 * ดึงสั่งคอนกรีตที่ยังไม่ได้ sync ไป Google Sheets
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
 * ดึงสั่งคอนกรีตตามวันที่
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
 * ดึงสั่งคอนกรีตตามโรงงาน
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
 * ดึงสั่งคอนกรีตทั้งหมด (พร้อม pagination)
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
 * ดึงสั่งคอนกรีตพร้อมตัวกรองละเอียด
 * @param {Object} filters
 * @param {number} limit
 * @param {number} offset
 * @returns {Array}
 */
function getOrdersByFilters(filters = {}, limit = 100, offset = 0) {
  if (!db) return [];

  const { clause, values } = buildWhereClause(filters);
  const results = db.exec(`
    SELECT * FROM concrete_orders
    ${clause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...values, limit, offset]);

  return formatResults(results);
}

/**
 * นับจำนวนสั่งคอนกรีตจากตัวกรองละเอียด
 * @param {Object} filters
 * @returns {number}
 */
function getOrdersCountByFilters(filters = {}) {
  if (!db) return 0;

  const { clause, values } = buildWhereClause(filters);
  const results = db.exec(`
    SELECT COUNT(*) as count FROM concrete_orders
    ${clause}
  `, values);

  return results[0]?.values[0][0] || 0;
}

/**
 * ดึงค่า distinct สำหรับตัวกรอง
 * @returns {Object}
 */
function getFilterOptions() {
  if (!db) {
    return {
      factories: [],
      products: [],
      supervisors: [],
      lineGroups: [],
      lineUsers: []
    };
  }

  return {
    factories: getDistinctValues('factory_id'),
    products: getDistinctValues('product_code'),
    supervisors: getDistinctValues('supervisor'),
    lineGroups: getDistinctValues('line_group_id'),
    lineUsers: getDistinctValues('line_user_id')
  };
}

/**
 * ดึงข้อมูลสรุปเพื่อแสดงกราฟ/แดชบอร์ด
 * @param {Object} filters
 * @param {'daily'|'monthly'} period
 * @returns {Object}
 */
function getAnalytics(filters = {}, period = 'daily') {
  if (!db) {
    return {
      totals: {},
      byFactory: [],
      byProduct: [],
      bySupervisor: [],
      timeSeries: [],
      syncStatus: []
    };
  }

  const { clause, values } = buildWhereClause(filters);
  const { clause: dateClause, values: dateValues } = buildWhereClause(filters, { requireDate: true });
  const periodKey = period === 'monthly'
    ? "substr(order_date, 1, 7)"
    : "order_date";

  const totalsResult = db.exec(`
    SELECT 
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement,
      AVG(cement_quantity) as avg_cement,
      SUM(loaded_quantity) as total_loaded,
      SUM(difference) as total_difference
    FROM concrete_orders
    ${clause}
  `, values);
  const totals = formatResults(totalsResult)[0] || {};

  const byFactory = getGroupSummary('factory_id', clause, values);
  const byProduct = getGroupSummary('product_code', clause, values);
  const bySupervisor = getGroupSummary('supervisor', clause, values);

  const timeSeriesResult = db.exec(`
    SELECT
      ${periodKey} as period_key,
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement
    FROM concrete_orders
    ${dateClause}
    GROUP BY period_key
    ORDER BY period_key ASC
  `, dateValues);
  const timeSeries = formatResults(timeSeriesResult);

  const syncResult = db.exec(`
    SELECT synced_to_sheets as status, COUNT(*) as count
    FROM concrete_orders
    ${clause}
    GROUP BY synced_to_sheets
  `, values);
  const syncStatus = formatResults(syncResult);

  return {
    totals,
    byFactory,
    byProduct,
    bySupervisor,
    timeSeries,
    syncStatus
  };
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

function buildWhereClause(filters = {}, options = {}) {
  const clauses = [];
  const values = [];

  if (options.requireDate) {
    clauses.push("order_date IS NOT NULL AND order_date != ''");
  }

  if (filters.startDate) {
    clauses.push('order_date >= ?');
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push('order_date <= ?');
    values.push(filters.endDate);
  }

  addInClause(clauses, values, 'factory_id', filters.factoryIds);
  addInClause(clauses, values, 'product_code', filters.productCodes);
  addInClause(clauses, values, 'supervisor', filters.supervisors);
  addInClause(clauses, values, 'line_group_id', filters.lineGroupIds);
  addInClause(clauses, values, 'line_user_id', filters.lineUserIds);

  if (filters.synced === '1' || filters.synced === '0') {
    clauses.push('synced_to_sheets = ?');
    values.push(Number(filters.synced));
  }

  addMinMaxClause(clauses, values, 'cement_quantity', filters.minCement, filters.maxCement);
  addMinMaxClause(clauses, values, 'loaded_quantity', filters.minLoaded, filters.maxLoaded);
  addMinMaxClause(clauses, values, 'difference', filters.minDifference, filters.maxDifference);

  if (filters.search) {
    const term = `%${filters.search}%`;
    clauses.push(`(
      product_detail LIKE ? 
      OR notes LIKE ? 
      OR raw_message LIKE ? 
      OR product_code LIKE ?
    )`);
    values.push(term, term, term, term);
  }

  const clause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { clause, values };
}

function addInClause(clauses, values, column, list) {
  if (!list || list.length === 0) return;
  const placeholders = list.map(() => '?').join(',');
  clauses.push(`${column} IN (${placeholders})`);
  values.push(...list);
}

function addMinMaxClause(clauses, values, column, minValue, maxValue) {
  if (minValue !== undefined && minValue !== null && minValue !== '') {
    clauses.push(`${column} >= ?`);
    values.push(minValue);
  }
  if (maxValue !== undefined && maxValue !== null && maxValue !== '') {
    clauses.push(`${column} <= ?`);
    values.push(maxValue);
  }
}

function getDistinctValues(column) {
  const results = db.exec(`
    SELECT DISTINCT ${column} as value
    FROM concrete_orders
    WHERE ${column} IS NOT NULL AND ${column} != ''
    ORDER BY ${column} ASC
  `);

  return formatResults(results).map(row => row.value);
}

function getGroupSummary(column, clause, values) {
  const results = db.exec(`
    SELECT 
      ${column} as group_key,
      COUNT(*) as order_count,
      SUM(cement_quantity) as total_cement
    FROM concrete_orders
    ${clause}
    GROUP BY ${column}
    ORDER BY total_cement DESC
  `, values);

  return formatResults(results);
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
  getOrdersByFilters,
  getOrdersCountByFilters,
  getFilterOptions,
  getAnalytics,
  getOrderCount
};
