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

  // Ensure new columns exist (for existing databases)
  try {
    const tableInfo = db.exec("PRAGMA table_info(concrete_orders)");

    if (tableInfo && tableInfo.length > 0 && tableInfo[0].values) {
      const columns = tableInfo[0].values.map(v => v[1]);

      if (!columns.includes('product_quantity')) {
        console.log('🏗️ Adding column: product_quantity');
        db.run("ALTER TABLE concrete_orders ADD COLUMN product_quantity REAL");
      }
      if (!columns.includes('product_unit')) {
        console.log('🏗️ Adding column: product_unit');
        db.run("ALTER TABLE concrete_orders ADD COLUMN product_unit TEXT");
      }
    } else {
      console.warn('⚠️ Could not retrieve table info for concrete_orders, column check skipped');
    }
  } catch (err) {
    console.error('⚠️ Error checking/updating schema:', err);
  }

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
 * เช็คว่ามีข้อความซ้ำหรือไม่ (ส่งซ้ำภายในช่วงเวลาที่กำหนด)
 * @param {string} rawMessage - ข้อความต้นฉบับ
 * @param {string|null} lineGroupId - LINE group ID
 * @param {string|null} lineUserId - LINE user ID
 * @param {number} windowMinutes - ช่วงเวลาเช็คซ้ำ (นาที) default 10
 * @returns {Object|null} { id } ถ้าพบซ้ำ, null ถ้าไม่ซ้ำ
 */
function findDuplicateOrder(rawMessage, lineGroupId, lineUserId, windowMinutes = 10) {
  if (!db || !rawMessage) return null;

  // ต้องมี group หรือ user อย่างน้อยอย่างหนึ่ง
  if (!lineGroupId && !lineUserId) return null;

  const modifier = `-${Number(windowMinutes) || 10} minutes`;
  const results = db.exec(
    `SELECT id FROM concrete_orders 
     WHERE raw_message = ? 
     AND ((line_group_id IS NOT NULL AND line_group_id = ?) OR (line_group_id IS NULL AND line_user_id = ?))
     AND datetime(created_at) >= datetime('now', ?)
     ORDER BY created_at DESC LIMIT 1`,
    [rawMessage, lineGroupId || '', lineUserId || '', modifier]
  );

  if (results && results[0]?.values?.length > 0) {
    return { id: results[0].values[0][0] };
  }
  return null;
}

/**
 * เช็ครายการซ้ำ (ข้อมูล order เดียวกันในวันเดียวกัน กลุ่มเดียวกัน)
 * @param {Object} order - ข้อมูล order
 * @returns {Object|null} { id } ถ้าพบซ้ำ, null ถ้าไม่ซ้ำ
 */
function findDuplicateOrderItem(order, windowMinutes = 30) {
  if (!db || !order) return null;

  if (!order.lineGroupId && !order.lineUserId) return null;

  const modifier = `-${Number(windowMinutes) || 30} minutes`;
  const results = db.exec(
    `SELECT id FROM concrete_orders 
     WHERE (COALESCE(order_date, '') = COALESCE(?, ''))
     AND (COALESCE(CAST(factory_id AS TEXT), '') = COALESCE(?, ''))
     AND (COALESCE(product_code, '') = COALESCE(?, ''))
     AND (COALESCE(product_detail, '') = COALESCE(?, ''))
     AND (COALESCE(cement_quantity, 0) = COALESCE(?, 0))
     AND ((line_group_id IS NOT NULL AND line_group_id = ?) OR (line_group_id IS NULL AND line_user_id = ?))
     AND datetime(created_at) >= datetime('now', ?)
     ORDER BY created_at DESC LIMIT 1`,
    [
      order.orderDate || '',
      String(order.factoryId ?? ''),
      order.productCode ?? '',
      order.productDetail ?? '',
      order.cementQuantity ?? 0,
      order.lineGroupId || '',
      order.lineUserId || '',
      modifier
    ]
  );

  if (results && results[0]?.values?.length > 0) {
    return { id: results[0].values[0][0] };
  }
  return null;
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
 * ตรวจสอบข้อมูลซ้ำในฐานข้อมูล
 * @returns {Object} { duplicateMessages: [], duplicateItems: [], summary }
 */
function findDuplicatesInDatabase() {
  if (!db) return { duplicateMessages: [], duplicateItems: [], summary: { total: 0, duplicateMessageGroups: 0, duplicateItemGroups: 0 } };

  // 1. ข้อความซ้ำ (raw_message + line_group_id หรือ line_user_id เหมือนกัน)
  const msgResults = db.exec(`
    SELECT raw_message, line_group_id, line_user_id, 
           GROUP_CONCAT(id) as ids, COUNT(*) as count
    FROM concrete_orders
    WHERE raw_message IS NOT NULL AND raw_message != ''
    GROUP BY raw_message, COALESCE(line_group_id, ''), COALESCE(line_user_id, '')
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  const duplicateMessages = msgResults && msgResults[0]?.values
    ? msgResults[0].values.map(row => ({
        raw_message_preview: (row[0] || '').substring(0, 80) + (row[0]?.length > 80 ? '...' : ''),
        line_group_id: row[1],
        line_user_id: row[2],
        ids: (row[3] || '').split(',').map(Number),
        count: row[4]
      }))
    : [];

  // 2. รายการซ้ำ (order_date + factory_id + product_code + product_detail + cement_quantity เหมือนกัน)
  const itemResults = db.exec(`
    SELECT order_date, factory_id, product_code, product_detail, cement_quantity,
           line_group_id, line_user_id,
           GROUP_CONCAT(id) as ids, COUNT(*) as count
    FROM concrete_orders
    GROUP BY 
      COALESCE(order_date, ''),
      COALESCE(CAST(factory_id AS TEXT), ''),
      COALESCE(product_code, ''),
      COALESCE(product_detail, ''),
      COALESCE(cement_quantity, 0),
      COALESCE(line_group_id, ''),
      COALESCE(line_user_id, '')
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  const duplicateItems = itemResults && itemResults[0]?.values
    ? itemResults[0].values.map(row => ({
        order_date: row[0],
        factory_id: row[1],
        product_code: row[2],
        product_detail_preview: (row[3] || '').substring(0, 40) + (row[3]?.length > 40 ? '...' : ''),
        cement_quantity: row[4],
        ids: (row[7] || '').split(',').map(Number),
        count: row[8]
      }))
    : [];

  const totalOrders = getOrderCount();
  const duplicateMessageCount = duplicateMessages.reduce((s, g) => s + g.count - 1, 0);
  const duplicateItemCount = duplicateItems.reduce((s, g) => s + g.count - 1, 0);

  return {
    duplicateMessages,
    duplicateItems,
    summary: {
      total: totalOrders,
      duplicateMessageGroups: duplicateMessages.length,
      duplicateMessageRecords: duplicateMessageCount,
      duplicateItemGroups: duplicateItems.length,
      duplicateItemRecords: duplicateItemCount,
      uniqueAfterDedup: totalOrders - Math.max(duplicateMessageCount, duplicateItemCount)
    }
  };
}

/**
 * ลบข้อมูลซ้ำในฐานข้อมูล - เก็บเฉพาะ ID ที่ต่ำที่สุด (รายการแรก) ของแต่ละกลุ่ม
 * @returns {Object} { deleted: number, kept: number }
 */
function removeDuplicatesFromDatabase() {
  if (!db) return { deleted: 0, kept: 0 };

  const report = findDuplicatesInDatabase();
  const idsToDelete = new Set();

  // รวม ID ที่ซ้ำจากทั้ง duplicateMessages และ duplicateItems (เก็บแค่ ID ที่ต่ำที่สุด)
  for (const group of report.duplicateMessages) {
    const sortedIds = [...group.ids].sort((a, b) => a - b);
    for (let i = 1; i < sortedIds.length; i++) {
      idsToDelete.add(sortedIds[i]);
    }
  }
  for (const group of report.duplicateItems) {
    const sortedIds = [...group.ids].sort((a, b) => a - b);
    for (let i = 1; i < sortedIds.length; i++) {
      idsToDelete.add(sortedIds[i]);
    }
  }

  const toDelete = [...idsToDelete];
  if (toDelete.length === 0) {
    return { deleted: 0, kept: getOrderCount() };
  }

  const placeholders = toDelete.map(() => '?').join(',');
  db.run(`DELETE FROM concrete_orders WHERE id IN (${placeholders})`, toDelete);
  saveDatabase();

  return {
    deleted: toDelete.length,
    kept: getOrderCount()
  };
}

/**
 * รีเซ็ตสถานะ sync ทั้งหมด (ตั้ง synced_to_sheets = 0)
 * ใช้เมื่อต้องการ re-sync ข้อมูลทั้งหมดไป Google Sheet
 */
function resetAllSyncStatus() {
  if (!db) return 0;
  const result = db.exec('SELECT COUNT(*) as c FROM concrete_orders');
  const count = result?.[0]?.values?.[0]?.[0] ?? 0;
  db.run('UPDATE concrete_orders SET synced_to_sheets = 0');
  saveDatabase();
  return count;
}

/**
 * ลบข้อมูลทั้งหมดใน concrete_orders
 * @returns {number} จำนวนที่ลบ
 */
function deleteAllOrders() {
  if (!db) return 0;

  const result = db.exec('SELECT COUNT(*) as count FROM concrete_orders');
  const count = result?.[0]?.values?.[0]?.[0] ?? 0;

  db.run('DELETE FROM concrete_orders');
  saveDatabase();

  return count;
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
  findDuplicateOrder,
  findDuplicateOrderItem,
  findDuplicatesInDatabase,
  removeDuplicatesFromDatabase,
  resetAllSyncStatus,
  deleteAllOrders,
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
  getOrderCount,
  saveDatabase
};
