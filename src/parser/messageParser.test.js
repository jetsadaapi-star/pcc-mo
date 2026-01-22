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
            cementQuantity: 1.1
        }
    }
];

// Run tests
console.log('🧪 Running Message Parser Tests...\n');

let passCount = 0;
let failCount = 0;

for (const test of testMessages) {
    console.log(`📝 ${test.name}`);
    console.log(`   Input: "${test.input.substring(0, 50)}..."`);

    const result = parseMessage(test.input);

    if (!result) {
        console.log('   ❌ FAILED: parseMessage returned null');
        failCount++;
        continue;
    }

    let passed = true;

    // Check each expected field
    for (const [key, expected] of Object.entries(test.expected)) {
        const actual = result[key];
        if (actual !== expected) {
            console.log(`   ❌ ${key}: expected "${expected}", got "${actual}"`);
            passed = false;
        } else {
            console.log(`   ✅ ${key}: ${actual}`);
        }
    }

    if (passed) {
        passCount++;
    } else {
        failCount++;
    }

    console.log('');
}

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
        passCount++;
    } else {
        console.log(`   ❌ "${input}" → expected "${expected}", got "${actual}"`);
        failCount++;
    }
}

console.log('');
console.log('📊 Test Results:');
console.log(`   ✅ Passed: ${passCount}`);
console.log(`   ❌ Failed: ${failCount}`);
console.log('');

if (failCount === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
} else {
    console.log('⚠️ Some tests failed!');
    process.exit(1);
}
