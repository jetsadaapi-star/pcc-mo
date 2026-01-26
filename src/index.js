/**
 * PCC-MO LINE Bot
 * Main Entry Point
 * 
 * ระบบ LINE Bot สำหรับเก็บข้อมูลการสั่งคอนกรีตจากกลุ่มไลน์
 */

// ตั้งค่า Timezone เป็นประเทศไทย (สำหรับ Railway deployment)
process.env.TZ = 'Asia/Bangkok';

require('dotenv').config();

const express = require('express');
const path = require('path');
const { middleware } = require('./line/lineClient');
const { handleWebhook } = require('./line/webhook');
const { initSheetsClient, syncToSheets, testConnection, createHeaderRow } = require('./sheets/sheetsClient');
const {
    initDatabase,
    getOrdersByFilters,
    getOrdersCountByFilters,
    getOrderCount,
    getDailySummary,
    getSummaryByDate,
    getSummaryByMonth,
    getFilterOptions,
    getAnalytics,
    saveDatabase
} = require('./database/db');
const { parseProductQuantity } = require('./parser/messageParser');
const { SCHEMA } = require('./database/schema'); // For migration context if needed

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (Dashboard UI)
app.use(express.static(path.join(__dirname, '../public')));

// Page routes for multi-page frontend
app.get('/orders', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/orders.html'));
});

app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/analytics.html'));
});

app.get('/compare', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/compare.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/settings.html'));
});

function parseFilters(query = {}) {
    const splitList = (value) => {
        if (!value) return [];
        return String(value)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    };

    const startDate = query.startDate || query.date || '';
    const endDate = query.endDate || query.date || '';

    return {
        startDate,
        endDate,
        factoryIds: splitList(query.factoryIds || query.factoryId),
        productCodes: splitList(query.productCodes || query.productCode),
        supervisors: splitList(query.supervisors || query.supervisor),
        lineGroupIds: splitList(query.lineGroupIds || query.lineGroupId),
        lineUserIds: splitList(query.lineUserIds || query.lineUserId),
        synced: query.synced ?? '',
        minCement: query.minCement ?? '',
        maxCement: query.maxCement ?? '',
        minLoaded: query.minLoaded ?? '',
        maxLoaded: query.maxLoaded ?? '',
        minDifference: query.minDifference ?? '',
        maxDifference: query.maxDifference ?? '',
        search: query.search ? String(query.search).trim() : ''
    };
}

// Health check API
app.get('/api/health', async (req, res) => {
    res.json({
        name: 'PCC-MO LINE Bot',
        status: 'running',
        version: '1.0.0'
    });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const orderCount = getOrderCount();
    const sheetsStatus = await testConnection();

    res.json({
        status: 'healthy',
        database: {
            connected: true,
            totalOrders: orderCount
        },
        googleSheets: sheetsStatus
    });
});

// LINE Webhook endpoint
app.post('/webhook', middleware, async (req, res) => {
    try {
        const events = req.body.events;
        console.log(`\n📨 Received ${events.length} event(s)`);

        await handleWebhook(events);

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: ดึง orders ล่าสุด
app.get('/api/orders', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const filters = parseFilters(req.query);
    const orders = getOrdersByFilters(filters, limit, offset);
    const total = getOrdersCountByFilters(filters);

    res.json({
        orders,
        total,
        limit,
        offset
    });
});

// API: สรุปรายวัน
app.get('/api/summary/:date', (req, res) => {
    const date = req.params.date; // YYYY-MM-DD
    const summary = getDailySummary(date);

    res.json({
        date,
        summary
    });
});

// API: ตัวเลือกสำหรับตัวกรอง
app.get('/api/filters', (req, res) => {
    const options = getFilterOptions();
    res.json(options);
});

// API: Analytics สำหรับกราฟและรายงาน
app.get('/api/analytics', (req, res) => {
    const period = req.query.period === 'monthly' ? 'monthly' : 'daily';
    const filters = parseFilters(req.query);

    const analytics = getAnalytics(filters, period);

    res.json({
        period,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        ...analytics
    });
});

// API: รายงานรายวัน/รายเดือน (แยกตามโรงงานและกลุ่มสินค้า)
app.get('/api/reports', (req, res) => {
    const period = req.query.period === 'monthly' ? 'monthly' : 'daily';

    if (period === 'monthly') {
        const month = req.query.month; // YYYY-MM
        if (!month) {
            return res.status(400).json({ error: 'month is required' });
        }

        const byFactory = getSummaryByMonth(month, 'factory');
        const byProduct = getSummaryByMonth(month, 'product');

        return res.json({
            period,
            month,
            byFactory,
            byProduct
        });
    }

    const date = req.query.date; // YYYY-MM-DD
    if (!date) {
        return res.status(400).json({ error: 'date is required' });
    }

    const byFactory = getSummaryByDate(date, 'factory');
    const byProduct = getSummaryByDate(date, 'product');

    return res.json({
        period,
        date,
        byFactory,
        byProduct
    });
});

// API: Manual sync to Google Sheets
app.post('/api/sync', async (req, res) => {
    try {
        const result = await syncToSheets();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: สร้าง header row ใน Google Sheets
app.post('/api/sheets/init', async (req, res) => {
    try {
        await createHeaderRow();
        res.json({ success: true, message: 'Header row created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: แยกข้อมูลเก่า (Migration)
app.post('/api/admin/migrate', async (req, res) => {
    try {
        console.log('🚀 Web Triggered Migration Starting...');
        const db = await initDatabase();
        if (!db) throw new Error('Failed to initialize database');

        const results = db.exec('SELECT id, raw_message FROM concrete_orders WHERE product_quantity IS NULL');
        console.log('🔍 Migration query results:', JSON.stringify(results));

        if (!results || results.length === 0 || !results[0].values || results[0].values.length === 0) {
            return res.json({ success: true, updated: 0, message: 'No records need migration' });
        }

        const rows = results[0].values;
        let updatedCount = 0;
        let errors = [];

        for (const row of rows) {
            const [id, rawMessage] = row;
            try {
                const productQty = parseProductQuantity(rawMessage);
                if (productQty.quantity !== null) {
                    const stmt = db.prepare('UPDATE concrete_orders SET product_quantity = ?, product_unit = ? WHERE id = ?');
                    stmt.run([productQty.quantity, productQty.unit, id]);
                    stmt.free();
                    updatedCount++;
                }
            } catch (itemErr) {
                console.error(`❌ Error migrating row ID ${id}:`, itemErr);
                errors.push(`ID ${id}: ${itemErr.message}`);
            }
        }

        saveDatabase();

        res.json({
            success: true,
            updated: updatedCount,
            total: rows.length,
            errorCount: errors.length,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
            message: `Migrated ${updatedCount} out of ${rows.length} records. Found ${errors.length} errors.`
        });
    } catch (err) {
        console.error('Migration API error:', err);
        res.status(500).json({
            error: 'Internal Migration Error',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     🏭 PCC-MO LINE Bot Starting...       ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    // Initialize Database
    await initDatabase();

    // Initialize Google Sheets
    await initSheetsClient();

    // Start Express server
    app.listen(PORT, () => {
        console.log(`🌐 Server running on http://localhost:${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
        console.log('');

        // Show order count
        const count = getOrderCount();
        console.log(`💾 Database has ${count} orders`);
        console.log('');
        console.log('Ready to receive messages from LINE groups!');
        console.log('');
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
