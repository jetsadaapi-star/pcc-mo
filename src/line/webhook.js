/**
 * LINE Webhook Handler
 * รับและประมวลผล events จาก LINE
 */

const { parseMessage } = require('../parser/messageParser');
const { insertOrder } = require('../database/db');
const { replyText } = require('./lineClient');
const { syncToSheets } = require('../sheets/sheetsClient');

/**
 * จัดการ webhook events
 * @param {Array} events 
 */
async function handleWebhook(events) {
    const results = await Promise.all(
        events.map(event => handleEvent(event))
    );
    return results;
}

/**
 * จัดการ event แต่ละอัน
 * @param {Object} event 
 */
async function handleEvent(event) {
    // รับเฉพาะ message event
    if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
    }

    const text = event.message.text;
    const userId = event.source.userId;
    const groupId = event.source.groupId || null;

    console.log(`📩 Received message from ${groupId ? 'group' : 'user'}: ${text.substring(0, 50)}...`);

    // Parse ข้อความ
    const parsed = parseMessage(text);

    if (!parsed) {
        console.log('   ⏭️ Not a concrete order message, skipping');
        return null;
    }

    console.log('   ✅ Parsed as concrete order:', {
        date: parsed.orderDate,
        factory: parsed.factoryId,
        product: parsed.productCode,
        quantity: parsed.cementQuantity
    });

    // เพิ่ม LINE metadata
    parsed.lineUserId = userId;
    parsed.lineGroupId = groupId;

    // บันทึกลง database
    try {
        const savedOrder = insertOrder(parsed);
        console.log(`   💾 Saved to database with ID: ${savedOrder.id}`);

        // ส่งข้อความยืนยัน (ถ้าเปิดใช้งาน)
        if (process.env.ENABLE_REPLY_MESSAGE === 'true') {
            const confirmMsg = formatConfirmMessage(savedOrder);
            await replyText(event.replyToken, confirmMsg);
        }

        // Sync ไป Google Sheets (async, ไม่ต้องรอ)
        syncToSheets().catch(err => {
            console.error('Error syncing to sheets:', err);
        });

        return savedOrder;
    } catch (err) {
        console.error('   ❌ Error saving to database:', err);
        return null;
    }
}

/**
 * สร้างข้อความยืนยัน
 * @param {Object} order 
 * @returns {string}
 */
function formatConfirmMessage(order) {
    const lines = ['✅ บันทึกข้อมูลสำเร็จ'];

    if (order.orderDate) {
        lines.push(`📅 วันที่: ${formatThaiDate(order.orderDate)}`);
    }
    if (order.factoryId) {
        lines.push(`🏭 โรงงาน: ${order.factoryId}`);
    }
    if (order.productCode) {
        lines.push(`📦 รหัส: ${order.productCode}`);
    }
    if (order.cementQuantity) {
        lines.push(`🧱 ปูน: ${order.cementQuantity} คิว`);
    }

    lines.push(`🔖 ID: #${order.id}`);

    return lines.join('\n');
}

/**
 * แปลงวันที่เป็นรูปแบบไทย
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(day)}/${parseInt(month)}/${parseInt(year) + 543}`;
}

module.exports = {
    handleWebhook,
    handleEvent,
    formatConfirmMessage
};
