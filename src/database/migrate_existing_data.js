/**
 * Data Migration Script
 * พึ่งพา logic จาก messageParser เพื่อแยกข้อมูลเดิมในฐานข้อมูล
 */

const { initDatabase, getAllOrders, saveDatabase } = require('./db');
const { parseProductQuantity } = require('../parser/messageParser');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log('🚀 Starting Data Migration...');

    // Initialize DB
    const db = await initDatabase();

    // Get all orders (using a large limit to get everything)
    const results = db.exec('SELECT id, raw_message FROM concrete_orders WHERE product_quantity IS NULL');

    if (!results || results.length === 0 || results[0].values.length === 0) {
        console.log('✅ No records need migration.');
        return;
    }

    const rows = results[0].values;
    console.log(`📦 Found ${rows.length} records to update.`);

    let updatedCount = 0;

    for (const [id, rawMessage] of rows) {
        const productQty = parseProductQuantity(rawMessage);

        if (productQty.quantity !== null) {
            const stmt = db.prepare('UPDATE concrete_orders SET product_quantity = ?, product_unit = ? WHERE id = ?');
            stmt.run([productQty.quantity, productQty.unit, id]);
            stmt.free();
            updatedCount++;
        }
    }

    // Save changes
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/orders.db');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Updated: ${updatedCount} records`);
    console.log(`⚠️ Unchanged: ${rows.length - updatedCount} records (not found in message)`);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
