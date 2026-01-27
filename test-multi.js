const { parseMessage } = require('./src/parser/messageParser');

const msg = 'เพิ่มสั่งคอนกรีต โรงงาน4 กล่องฐานราก60×60 A35-FZC-F60 จำนวน 6 ชิ้น A35-FZC-F35 จำนวน 6 ชิ้น จำนวนคอนกรีต=0.4 คิว ชุดPccพร้อม';

console.log('Testing multi-items parsing...');
console.log('Input message:', msg);
console.log('');

const result = parseMessage(msg);

if (!result || result.length === 0) {
    console.log('❌ No items found');
    process.exit(1);
}

console.log('Items found:', result.length);
console.log('');

result.forEach((r, i) => {
    console.log(`Item ${i + 1}:`);
    console.log(`  Code: ${r.productCode}`);
    console.log(`  Qty:  ${r.productQuantity} ${r.productUnit || ''}`);
    console.log('');
});

// Validate expected output
if (result.length === 2 &&
    result[0].productCode === 'A35-FZC-F60' && result[0].productQuantity === 6 &&
    result[1].productCode === 'A35-FZC-F35' && result[1].productQuantity === 6) {
    console.log('✅ All tests passed!');
} else {
    console.log('❌ Test failed - unexpected output');
}
