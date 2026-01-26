/**
 * Google Sheets Client
 * Integration สำหรับ sync ข้อมูลไป Google Sheets
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { getUnsyncedOrders, markAsSynced } = require('../database/db');

let sheetsClient = null;
let isConfigured = false;

/**
 * Initialize Google Sheets client
 */
async function initSheetsClient() {
    try {
        const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

        if (!keyPath || !fs.existsSync(keyPath)) {
            console.log('⚠️ Google Sheets: Service account key not found, sync disabled');
            return false;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        isConfigured = true;

        console.log('✅ Google Sheets client initialized');
        return true;
    } catch (err) {
        console.error('❌ Error initializing Google Sheets:', err.message);
        return false;
    }
}

/**
 * Sync ข้อมูลที่ยังไม่ได้ sync ไปยัง Google Sheets
 */
async function syncToSheets() {
    if (!isConfigured) {
        await initSheetsClient();
    }

    if (!sheetsClient) {
        return { synced: 0, error: 'Google Sheets not configured' };
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    if (!spreadsheetId) {
        return { synced: 0, error: 'GOOGLE_SHEETS_ID not set' };
    }

    try {
        // ดึง orders ที่ยังไม่ได้ sync
        const orders = getUnsyncedOrders();

        if (orders.length === 0) {
            return { synced: 0 };
        }

        console.log(`📤 Syncing ${orders.length} orders to Google Sheets...`);

        // แปลงเป็น rows
        const rows = orders.map(order => [
            order.order_date || '',
            order.factory_id || '',
            order.product_code || '',
            order.product_detail || '',
            order.product_quantity || '',
            order.product_unit || '',
            order.cement_quantity || '',
            order.loaded_quantity || '',
            order.difference || '',
            order.supervisor || '',
            order.notes || '',
            order.created_at || ''
        ]);

        // Append to sheet
        await sheetsClient.spreadsheets.values.append({
            spreadsheetId,
            range: 'Sheet1!A:L', // ปรับ range ตามชื่อ sheet
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: rows }
        });

        // Mark as synced
        const ids = orders.map(o => o.id);
        markAsSynced(ids);

        console.log(`✅ Synced ${orders.length} orders to Google Sheets`);
        return { synced: orders.length };
    } catch (err) {
        console.error('❌ Error syncing to Google Sheets:', err.message);
        return { synced: 0, error: err.message };
    }
}

/**
 * สร้าง header row ใน Google Sheets (run once)
 */
async function createHeaderRow() {
    if (!sheetsClient) {
        await initSheetsClient();
    }

    if (!sheetsClient) {
        console.error('Google Sheets not configured');
        return;
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const headers = [
        'วันที่',
        'โรงงาน',
        'รหัสสินค้า',
        'รายการสินค้าที่ผลิต',
        'จำนวนสินค้า',
        'หน่วย',
        'จำนวนปูน (คิว)',
        'จำนวนที่โหลด',
        'ผลต่าง',
        'ผู้ดูแล',
        'หมายเหตุ',
        'สร้างเมื่อ'
    ];

    try {
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId,
            range: 'Sheet1!A1:L1',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [headers] }
        });
        console.log('✅ Header row created');
    } catch (err) {
        console.error('Error creating header row:', err.message);
    }
}

/**
 * ทดสอบการเชื่อมต่อ
 */
async function testConnection() {
    if (!sheetsClient) {
        await initSheetsClient();
    }

    if (!sheetsClient) {
        return { success: false, error: 'Not configured' };
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
        const response = await sheetsClient.spreadsheets.get({
            spreadsheetId
        });

        return {
            success: true,
            title: response.data.properties.title,
            sheets: response.data.sheets.map(s => s.properties.title)
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = {
    initSheetsClient,
    syncToSheets,
    createHeaderRow,
    testConnection
};
