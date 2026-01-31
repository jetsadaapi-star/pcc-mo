/**
 * LINE Webhook Handler
 * รับและประมวลผล events จาก LINE
 */

const { parseMessage } = require('../parser/messageParser');
const { insertOrder, findDuplicateOrder, findDuplicateOrderItem } = require('../database/db');
const { replyText } = require('./lineClient');
const { syncToSheets } = require('../sheets/sheetsClient');

const DEDUP_MESSAGE_MINUTES = parseInt(process.env.DEDUP_MESSAGE_MINUTES || '10', 10);
const DEDUP_ITEM_MINUTES = parseInt(process.env.DEDUP_ITEM_MINUTES || '30', 10);

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

    // Parse ข้อความ (จะได้เป็น Array ของ items)
    const parsedItems = parseMessage(text);

    if (!parsedItems || parsedItems.length === 0) {
        console.log('   ⏭️ Not a concrete order message, skipping');
        return null;
    }

    console.log(`   ✅ Parsed into ${parsedItems.length} item(s)`);

    // เช็คข้อความซ้ำทั้งหมด (ส่งข้อความเดิมซ้ำภายในช่วงเวลา)
    const msgDup = findDuplicateOrder(text, groupId, userId, DEDUP_MESSAGE_MINUTES);
    if (msgDup) {
        console.log(`   ⏭️ Duplicate message detected (same as ID #${msgDup.id}), skipping`);
        return null;
    }

    const savedOrders = [];

    // วนลูปบันทึกแต่ละรายการ
    for (const item of parsedItems) {
        // เพิ่ม LINE metadata
        item.lineUserId = userId;
        item.lineGroupId = groupId;
        item.rawMessage = text;

        // เช็ครายการซ้ำ (order เดียวกันในกลุ่ม/ช่วงเวลาเดียวกัน)
        const itemDup = findDuplicateOrderItem(item, DEDUP_ITEM_MINUTES);
        if (itemDup) {
            console.log(`   ⏭️ Duplicate item [${item.productCode}] (same as ID #${itemDup.id}), skipping`);
            continue;
        }

        try {
            const savedOrder = insertOrder(item);
            console.log(`   💾 Saved Item [${item.productCode}] with ID: ${savedOrder.id}`);
            savedOrders.push(savedOrder);
        } catch (err) {
            console.error(`   ❌ Error saving item [${item.productCode}]:`, err);
        }
    }

    // ถ้ามีการบันทึกสำเร็จอย่างน้อย 1 รายการ
    if (savedOrders.length > 0) {
        const firstOrder = savedOrders[0];

        // ส่งข้อความยืนยัน (ถ้าเปิดใช้งาน)
        if (process.env.ENABLE_REPLY_MESSAGE === 'true') {
            const confirmMsg = formatConfirmMessage(firstOrder, savedOrders.length);
            await replyText(event.replyToken, confirmMsg);
        }

        // Sync ไป Google Sheets
        syncToSheets().catch(err => {
            console.error('Error syncing to sheets:', err);
        });

        return savedOrders;
    }

    return null;
}

/**
 * สร้างข้อความยืนยัน
 * @param {Object} order 
 * @param {number} totalItems 
 * @returns {string}
 */
function formatConfirmMessage(order, totalItems = 1) {
    const lines = [`✅ บันทึกสำเร็จ (${totalItems} รายการ)`];

    if (order.orderDate) {
        lines.push(`📅 วันที่: ${formatThaiDate(order.orderDate)}`);
    }
    if (order.factoryId) {
        lines.push(`🏭 โรงงาน: ${order.factoryId}`);
    }

    // แสดงสินค้าหลักรายการแรก
    if (order.productCode) {
        lines.push(`📦 สินค้า: ${order.productCode}`);
    }
    if (order.cementQuantity) {
        lines.push(`🧱 ปูนทั้งหมด: ${order.cementQuantity} คิว`);
    }

    lines.push(`🔖 ID ล่าสุด: #${order.id}`);

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
