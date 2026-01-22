/**
 * Database Schema for Concrete Orders
 * สร้าง table สำหรับเก็บข้อมูลการสั่งคอนกรีต
 */

const SCHEMA = `
-- ตาราง concrete_orders สำหรับเก็บข้อมูลการสั่งคอนกรีต
CREATE TABLE IF NOT EXISTS concrete_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_date TEXT,
  factory_id INTEGER,
  product_code TEXT,
  product_detail TEXT,
  cement_quantity REAL,
  loaded_quantity REAL,
  difference REAL,
  supervisor TEXT,
  notes TEXT,
  raw_message TEXT,
  line_user_id TEXT,
  line_group_id TEXT,
  synced_to_sheets INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Index สำหรับ query ที่ใช้บ่อย
CREATE INDEX IF NOT EXISTS idx_order_date ON concrete_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_factory_id ON concrete_orders(factory_id);
CREATE INDEX IF NOT EXISTS idx_synced_to_sheets ON concrete_orders(synced_to_sheets);
`;

module.exports = { SCHEMA };
