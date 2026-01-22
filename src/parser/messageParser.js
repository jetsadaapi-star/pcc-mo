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
 * รองรับ: A35, A42, A13
 * @param {string} text 
 * @returns {string|null}
 */
function parseProductCode(text) {
    const pattern = /\b(A\d{2})\b/i;
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
 * Parse ข้อความจาก LINE เป็น structured data
 * @param {string} text - ข้อความจาก LINE
 * @returns {Object|null} - parsed data หรือ null ถ้าไม่ใช่ order message
 */
function parseMessage(text) {
    if (!isConcreteOrderMessage(text)) {
        return null;
    }

    const result = {
        orderDate: parseDate(text),
        factoryId: parseFactory(text),
        productCode: parseProductCode(text),
        productDetail: parseProductDetail(text),
        cementQuantity: parseCementQuantity(text),
        loadedQuantity: null, // จะเติมทีหลังจากระบบโม่
        difference: null,
        supervisor: parseSupervisor(text),
        notes: null,
        rawMessage: text
    };

    return result;
}

module.exports = {
    parseMessage,
    parseDate,
    parseFactory,
    parseProductCode,
    parseCementQuantity,
    parseSupervisor,
    parseProductDetail,
    isConcreteOrderMessage
};
