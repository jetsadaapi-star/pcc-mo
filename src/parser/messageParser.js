/**
 * Message Parser
 * แปลงข้อความจาก LINE Group เป็นข้อมูลที่ structured
 */

/**
 * แปลงวันที่จากรูปแบบต่างๆ เป็น YYYY-MM-DD
 * รองรับ: 21/01/69, 21/1/69, 21-01-2569, วันที่ 21/1/69
 * @param {string} dateStr 
 * @returns {string|null}
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    // รูปแบบ: DD/MM/YY หรือ DD/MM/YYYY หรือ DD-MM-YY
    const datePattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const match = dateStr.match(datePattern);

    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);

        // แปลง พ.ศ. เป็น ค.ศ. (ถ้าปี > 2500 หรือ 2 หลัก >= 43)
        if (year >= 2500) {
            year -= 543;
        } else if (year < 100) {
            if (year >= 43) {
                // 2 หลัก และเป็น พ.ศ. (เช่น 69 = 2569 -> 2026)
                year = year + 1957; // 2500 - 543
            } else {
                // 2 หลัก แต่เป็น ค.ศ. (เช่น 26 = 2026)
                year = 2000 + year;
            }
        }

        // Format: YYYY-MM-DD
        const paddedMonth = month.toString().padStart(2, '0');
        const paddedDay = day.toString().padStart(2, '0');

        return `${year}-${paddedMonth}-${paddedDay}`;
    }

    return null;
}

/**
 * ดึงหมายเลขโรงงานจากข้อความ
 * รองรับ: โรง4, โรง 4, โรงงาน4, โรงงาน 4
 * @param {string} text 
 * @returns {number|null}
 */
function parseFactory(text) {
    const patterns = [
        /โรง(?:งาน)?\s*(\d+)/i,
        /factory\s*(\d+)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    return null;
}

/**
 * ดึงรหัสสินค้าจากข้อความ
 * รองรับ: A35, A42, A13, A35-FZC-F60 (แบบซับซ้อน)
 * @param {string} text 
 * @returns {string|null}
 */
function parseProductCode(text) {
    // ปรับให้รองรับรหัสที่ยาวขึ้น เช่น A35-FZC-F60
    const pattern = /\b(A\d{2}[A-Z\d\-]*)\b/i;
    const match = text.match(pattern);
    return match ? match[1].toUpperCase() : null;
}

/**
 * ดึงจำนวนปูนจากข้อความ (หน่วย: คิว)
 * รองรับ: =0.7คิว, จำนวนปูน=0.7คิว, รวม = 0.7 คิว
 * @param {string} text 
 * @returns {number|null}
 */
function parseCementQuantity(text) {
    const patterns = [
        // รวมทั้งหมด = 0.7 คิว
        /รวม(?:ทั้งหมด)?\s*=?\s*([\d\.]+)\s*คิว/i,
        // จำนวนปูน=0.7คิว
        /จำนวน(?:ปูน|คอนกรีต)?\s*=?\s*([\d\.]+)\s*คิว/i,
        // =0.7คิว (บรรทัดเดียว)
        /=\s*([\d\.]+)\s*คิว/i,
        // 0.7 คิว (ตัวเลขตามด้วยคิว)
        /([\d\.]+)\s*คิว/i
    ];

    // หา pattern รวมทั้งหมด ก่อน (มี priority สูงสุด)
    const totalPattern = /รวม(?:ทั้งหมด)?\s*=?\s*([\d\.]+)\s*คิว/i;
    const totalMatch = text.match(totalPattern);
    if (totalMatch) {
        return parseFloat(totalMatch[1]);
    }

    // จากนั้นหา pattern อื่นๆ
    for (const pattern of patterns.slice(1)) {
        const match = text.match(pattern);
        if (match) {
            return parseFloat(match[1]);
        }
    }

    return null;
}

/**
 * ดึงชื่อผู้ดูแลจากข้อความ (ถ้ามี)
 * @param {string} text 
 * @returns {string|null}
 */
function parseSupervisor(text) {
    const patterns = [
        /ผู้ดูแล[:\s]*(.+)/i,
        /พี่(\S+)/i,
        /ผรม\.?\s*(\S+)/i,
        /ผู้รับผิดชอบ[:\s]*(.+)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].trim().substring(0, 50);
        }
    }

    return null;
}

/**
 * ดึงรายการสินค้าทั้งหมดจากข้อความ
 * สกัดกรณีที่มีรหัสสินค้าหลายตัวและจำนวนหลายที่
 * @param {string} text 
 * @returns {Array} Array of { code, quantity, unit, detail }
 */
function parseItems(text) {
    const items = [];

    // Pattern สำหรับหา <รหัสสินค้า> <จำนวน> <หน่วย>
    // เช่น A35-FZC-F60 จำนวน 6 ชิ้น
    const itemPattern = /(A\d{2}[A-Z\d\-]*)\s*(?:จำนวน\s*)?(\d+(?:\.\d+)?)\s*(แผ่น|ตัว|ต้น|ชุด|คู่|ชิ้น|ท่อน|วง|ลูก|กล่อง)/gi;

    let match;
    while ((match = itemPattern.exec(text)) !== null) {
        items.push({
            code: match[1].toUpperCase(),
            quantity: parseFloat(match[2]),
            unit: match[3],
            detail: match[0] // เก็บข้อความเต็มที่ match ได้ไว้ก่อน
        });
    }

    // ถ้าไม่เจอตาม pattern สินค้า+จำนวน ให้ลองหารหัสสินค้าอย่างเดียว (Legacy mode)
    if (items.length === 0) {
        const code = parseProductCode(text);
        if (code) {
            const qty = parseProductQuantity(text);
            items.push({
                code: code,
                quantity: qty.quantity,
                unit: qty.unit,
                detail: parseProductDetail(text)
            });
        }
    }

    return items;
}

/**
 * ดึงจำนวนสินค้าและหน่วยจากข้อความ (สำหรับ 1 รายการ)
 * @param {string} text 
 * @returns {Object} { quantity: number|null, unit: string|null }
 */
function parseProductQuantity(text) {
    const patterns = [
        /=\s*(\d+(?:\.\d+)?)\s*(แผ่น|ตัว|ต้น|ชุด|คู่|ชิ้น|ท่อน|วง|ลูก|กล่อง)/i,
        /(\d+(?:\.\d+)?)\s*(แผ่น|ตัว|ต้น|ชุด|คู่|ชิ้น|ท่อน|วง|ลูก|กล่อง)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                quantity: parseFloat(match[1]),
                unit: match[2]
            };
        }
    }

    return { quantity: null, unit: null };
}

/**
 * เช็คว่าข้อความนี้เป็นข้อมูลการสั่งคอนกรีตหรือไม่
 * @param {string} text 
 * @returns {boolean}
 */
function isConcreteOrderMessage(text) {
    if (!text || text.length < 10) return false;

    const indicators = [
        /สั่งคอนกรีต/i,
        /A\d{2}/i,
        /คิว/i,
        /โรง\s*\d+/i
    ];

    let matchCount = 0;
    for (const pattern of indicators) {
        if (pattern.test(text)) {
            matchCount++;
        }
    }

    // ต้องมีอย่างน้อย 2 indicators จึงจะถือว่าเป็น order
    return matchCount >= 2;
}

/**
 * สกัดรายละเอียดสินค้าจากข้อความ
 * @param {string} text 
 * @returns {string}
 */
function parseProductDetail(text) {
    // ลบบรรทัดที่เป็น meta data ออก แล้วเก็บรายละเอียดที่เหลือ
    const lines = text.split('\n');
    const detailLines = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // ข้ามบรรทัดที่เป็น date, factory header, total
        if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(trimmed)) continue;
        if (/^วันที่/.test(trimmed)) continue;
        if (/^โรง\s*\d+\s*สั่งคอนกรีต/.test(trimmed)) continue;
        if (/^สั่งคอนกรีต/i.test(trimmed)) continue;
        if (/^รวม(?:ทั้งหมด)?/.test(trimmed)) continue;

        detailLines.push(trimmed);
    }

    return detailLines.join('\n').substring(0, 500);
}

/**
 * Parse ข้อความจาก LINE เป็น structured data (รองรับหลายรายการ)
 * @param {string} text - ข้อความจาก LINE
 * @returns {Array|null} - รายการ parsed data หรือ null ถ้าไม่ใช่ order message
 */
function parseMessage(text) {
    if (!isConcreteOrderMessage(text)) {
        return null;
    }

    const orderDate = parseDate(text);
    const factoryId = parseFactory(text);
    const supervisor = parseSupervisor(text);
    const totalCement = parseCementQuantity(text);
    const items = parseItems(text);

    if (items.length === 0) return null;

    // สร้างรายการข้อมูลสำหรับแต่ละสินค้า
    return items.map((item, index) => ({
        orderDate,
        factoryId,
        productCode: item.code,
        productDetail: item.detail,
        productQuantity: item.quantity,
        productUnit: item.unit,
        // ให้ปูนทั้งหมดอยู่ที่รายการแรก เพื่อไม่ให้ยอดรวมซ้ำซ้อน
        cementQuantity: index === 0 ? totalCement : null,
        loadedQuantity: null,
        difference: null,
        supervisor,
        notes: items.length > 1 ? `รายการที่ ${index + 1}/${items.length}` : null,
        rawMessage: text
    }));
}

module.exports = {
    parseMessage,
    parseDate,
    parseFactory,
    parseProductCode,
    parseCementQuantity,
    parseProductQuantity,
    parseSupervisor,
    parseProductDetail,
    isConcreteOrderMessage
};
