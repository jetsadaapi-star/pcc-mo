/**
 * Google Sheets Client
 * Integration สำหรับ sync ข้อมูลไป Google Sheets
 */

const { google } = require('googleapis');
const fs = require('fs');
const { getUnsyncedOrders, markAsSynced } = require('../database/db');

let sheetsClient = null;
let isConfigured = false;

/** ดัชนี sheet ที่จะใช้ (0 = แท็บแรก) */
function getSheetIndex() {
    const idx = process.env.GOOGLE_SHEET_INDEX;
    return idx !== undefined ? parseInt(idx, 10) : 0;
}

/** สร้าง range string (ใส่ quotes ถ้าชื่อ sheet มีช่องว่าง/อักขระพิเศษ) */
function buildRange(sheetName, range) {
    const needsQuotes = /[\s'"]/.test(sheetName);
    const quoted = needsQuotes ? `'${String(sheetName).replace(/'/g, "''")}'` : sheetName;
    return `${quoted}!${range}`;
}

/**
 * Initialize Google Sheets client
 * รองรับ 3 วิธี: JSON env (Railway), Base64 env, keyFile path (local)
 */
async function initSheetsClient() {
    try {
        let credentials = null;

        // 1. Railway/Cloud: ใช้ JSON string จาก env
        const jsonCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        if (jsonCreds) {
            try {
                credentials = typeof jsonCreds === 'string' ? JSON.parse(jsonCreds) : jsonCreds;
            } catch (e) {
                console.error('❌ Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON');
                return false;
            }
        }

        // 2. Railway/Cloud: ใช้ Base64 encoded JSON (เหมาะกับค่าซับซ้อน)
        if (!credentials && process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
            try {
                const decoded = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf8');
                credentials = JSON.parse(decoded);
            } catch (e) {
                console.error('❌ Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64');
                return false;
            }
        }

        // 3. Local: ใช้ไฟล์ key
        const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
        if (!credentials && keyPath && fs.existsSync(keyPath)) {
            credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        }

        if (!credentials) {
            console.log('⚠️ Google Sheets: No credentials (keyFile/env), sync disabled');
            return false;
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
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
 * ดึงชื่อแท็บของ spreadsheet จาก API (ใช้ชื่อจริง ไม่ใช้ค่าจาก user)
 */
async function getSheetNameFromApi(spreadsheetId, index = 0) {
    const res = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const sheets = res.data.sheets || [];
    if (sheets.length === 0) return 'Sheet1';
    const sheet = sheets[Math.min(index, sheets.length - 1)];
    const title = sheet?.properties?.title;
    return title || 'Sheet1';
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
        // ใช้ชื่อแท็บจริงจาก API เสมอ (ชื่อไฟล์ ≠ ชื่อแท็บ เช่น ไฟล์="รายงานโม่..." แท็บ="ชีต1")
        const sheetIndex = getSheetIndex();
        const sheetName = await getSheetNameFromApi(spreadsheetId, sheetIndex);
        const range = buildRange(sheetName, 'A:L');

        // ดึง orders ที่ยังไม่ได้ sync
        const orders = getUnsyncedOrders();

        if (orders.length === 0) {
            return { synced: 0 };
        }

        // สร้าง header อัตโนมัติถ้าแถวแรกว่างหรือไม่มี header ถูกต้อง
        const headerRange = buildRange(sheetName, 'A1');
        const headerCheck = await sheetsClient.spreadsheets.values.get({
            spreadsheetId,
            range: headerRange
        }).catch(() => null);
        const a1Value = headerCheck?.data?.values?.[0]?.[0];
        if (!a1Value || a1Value !== 'วันที่') {
            await createHeaderRow();
        }

        console.log(`📤 Syncing ${orders.length} orders to Google Sheets (${sheetName})...`);

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
            range,
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
    const sheetIndex = getSheetIndex();
    const sheetName = await getSheetNameFromApi(spreadsheetId, sheetIndex);
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
            range: buildRange(sheetName, 'A1:L1'),
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
