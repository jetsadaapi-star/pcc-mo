/**
 * Message Parser Tests
 * ทดสอบ parsing ข้อความจากกลุ่ม LINE
 */

const {
    parseMessage,
    parseDate,
    parseFactory,
    parseProductCode,
    parseCementQuantity,
    isConcreteOrderMessage
} = require('./messageParser');

// Test cases
const testMessages = [
    {
        name: 'ตัวอย่าง 1: โรง4 A42 Counterfort',
        input: `21/01/69
โรง4 สั่งคอนกรีต
A42-L-Wall-H200
Counterfort 8 ตัว
จำนวนปูน=0.7คิว
รวมทั้งหมด = 0.7 คิว`,
        expected: {
            orderDate: '2026-01-21',
            factoryId: 4,
            productCode: 'A42',
            productQuantity: 8,
            productUnit: 'ตัว',
            cementQuantity: 0.7
        }
    },
    {
        name: 'ตัวอย่าง 2: โรง2 A35 แผ่นรั้ว',
        input: `วันที่ 21/1/69
โรง 2 สั่งคอนกรีต A35   
แผ่นรั้ว slump 23-24 cm.
PCC เทแผ่นรั้ว New.ทับหลัง
2โต๊ะ=20แผ่น
=0.35คิว  (พร้อมเทครับ )`,
        expected: {
            orderDate: '2026-01-21',
            factoryId: 2,
            productCode: 'A35',
            productQuantity: 20,
            productUnit: 'แผ่น',
            cementQuantity: 0.35
        }
    },
    {
        name: 'ตัวอย่าง 3: โรง4 เสารั้ว',
        input: `20/1/2026
โรง4 สั่งคอนกรีต
เสารั้ว A35-Fzc-I15Ns-C200=28ต้น
จำนวนปูน=1.1คิว`,
        expected: {
            orderDate: '2026-01-20',
            factoryId: 4,
            productCode: 'A35',
            productQuantity: 28,
            productUnit: 'ต้น',
            cementQuantity: 1.1
        }
    },
    {
        name: 'ตัวอย่าง 4: จาก USER (75แผ่น)',
        input: `26/01/69
โรง 2 สั่งคอนกรีต A35   
แผ่นรั้ว slump 23-24 cm.
PCC เทแผ่นรั้ว New. โต๊ะ=8-9-10-2-4=75แผ่น
(5โต๊ะ)
=1.5คิว`,
        expected: {
            orderDate: '2026-01-26',
            factoryId: 2,
            productCode: 'A35',
            productQuantity: 75,
            productUnit: 'แผ่น',
            cementQuantity: 1.5
        }
    }
];

// Run tests
console.log('🧪 Running Message Parser Tests...\n');

const results = { passed: 0, failed: 0 };

for (const test of testMessages) {
    console.log(`📝 ${test.name}`);
    console.log(`   Input: "${test.input.substring(0, 50)}..."`);

    // ดึงค่าจริง
    const actual = parseMessage(test.input);

    if (actual === null) {
        if (test.expected === null) {
            console.log(`   ✅ match (null)`);
        } else {
            console.log(`   ❌ match failed: expected data but got null`);
            results.failed++;
        }
        continue;
    }

    // กรณีเป็น Array (ระบบใหม่)
    const firstItem = actual[0];

    // ตรวจสอบข้อมูล
    let passed = true;
    for (const [key, expectedValue] of Object.entries(test.expected)) {
        const actualValue = firstItem[key];
        if (actualValue === expectedValue) {
            console.log(`   ✅ ${key}: ${actualValue}`);
        } else {
            console.log(`   ❌ ${key}: expected ${expectedValue} but got ${actualValue}`);
            passed = false;
        }
    }

    if (passed) {
        results.passed++;
    } else {
        results.failed++;
    }

    console.log('');
}

// เพิ่ม Test Case พิเศษสำหรับ Multi-items
const multiItemTest = {
    name: 'ตัวอย่าง 5: Multi-items (จาก USER)',
    input: `26/01/69
โรง4 สั่งคอนกรีต
กล่องฐานราก60×60 A35-FZC-F60 จำนวน 6 ชิ้น A35-FZC-F35 จำนวน 6 ชิ้น 
จำนวนคอนกรีต=0.25 คิว
ชุดPccพร้อมเทครับ`,
    expected: [
        { productCode: 'A35-FZC-F60', productQuantity: 6, cementQuantity: 0.25 },
        { productCode: 'A35-FZC-F35', productQuantity: 6, cementQuantity: null }
    ]
};

console.log(`\n📝 ${multiItemTest.name}`);
const multiResult = parseMessage(multiItemTest.input);
if (multiResult && multiResult.length === 2) {
    console.log(`   ✅ Parsed 2 items correctly`);
    let subPassed = true;
    multiItemTest.expected.forEach((exp, i) => {
        const item = multiResult[i];
        if (item.productCode === exp.productCode && item.productQuantity === exp.productQuantity && item.cementQuantity === exp.cementQuantity) {
            console.log(`      Item ${i + 1} [${item.productCode}]: OK`);
        } else {
            console.log(`      Item ${i + 1} [${item.productCode}]: FAILED`, { expected: exp, getting: item });
            subPassed = false;
        }
    });
    if (subPassed) results.passed++; else results.failed++;
} else {
    console.log(`   ❌ Failed: expected 2 items but got ${multiResult?.length || 0}`);
    results.failed++;
}
console.log('');


// Test date parsing specifically
console.log('📅 Date Parsing Tests:');
const dateCases = [
    { input: '21/01/69', expected: '2026-01-21' },
    { input: '21/1/69', expected: '2026-01-21' },
    { input: '20/1/2026', expected: '2026-01-20' },
    { input: '15-12-68', expected: '2025-12-15' },
];

for (const { input, expected } of dateCases) {
    const actual = parseDate(input);
    if (actual === expected) {
        console.log(`   ✅ "${input}" → "${actual}"`);
        results.passed++;
    } else {
        console.log(`   ❌ "${input}" → expected "${expected}", got "${actual}"`);
        results.failed++;
    }
}

console.log('');
console.log('📊 Test Results:');
console.log(`   ✅ Passed: ${results.passed}`);
console.log(`   ❌ Failed: ${results.failed}`);
console.log('');

if (results.failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
} else {
    console.log('⚠️ Some tests failed!');
    process.exit(1);
}
