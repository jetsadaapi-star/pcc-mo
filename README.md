# PCC-MO LINE Bot

ระบบ LINE Bot สำหรับเก็บข้อมูลการสั่งคอนกรีตจากกลุ่มไลน์ และบันทึกลง Database + Google Sheets

## 🚀 Quick Start

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
# Copy .env.example เป็น .env
cp .env.example .env

# แก้ไข .env ใส่ค่าจริง
```

**ค่าที่ต้องตั้ง:**
- `LINE_CHANNEL_SECRET` - จาก LINE Developers Console
- `LINE_CHANNEL_ACCESS_TOKEN` - จาก LINE Developers Console
- `GOOGLE_SHEETS_ID` - ID ของ Google Sheets (ดูจาก URL)
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` - path ไปยังไฟล์ JSON key

### 3. ตั้งค่า Google Sheets (Optional)

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)
2. สร้าง Project ใหม่
3. เปิดใช้ Google Sheets API
4. สร้าง Service Account และดาวน์โหลด JSON key
5. บันทึกไฟล์ key ไว้ในโปรเจค เช่น `credentials/google-service-account.json`
6. Share Google Sheet กับ email ของ Service Account

### 4. รัน Server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

### 5. ตั้งค่า LINE Webhook

1. ไปที่ [LINE Developers Console](https://developers.line.biz)
2. เลือก Channel ของคุณ
3. ใน Messaging API tab ตั้ง Webhook URL เป็น: `https://your-domain.com/webhook`
4. เปิดใช้ "Use webhook"
5. เปิด "Allow bot to join group chats"

> 💡 **Tip**: ใช้ [ngrok](https://ngrok.com) สำหรับทดสอบ local: `ngrok http 3000`

---

## 📋 รูปแบบข้อความที่รองรับ

Bot จะรับข้อความที่มีข้อมูลต่อไปนี้:

```
21/01/69
โรง4 สั่งคอนกรีต
A42-L-Wall-H200
Counterfort 8 ตัว
จำนวนปูน=0.7คิว
รวมทั้งหมด = 0.7 คิว
```

**ข้อมูลที่ดึงได้:**
- 📅 วันที่: รองรับ DD/MM/YY, DD/MM/YYYY (ทั้ง พ.ศ. และ ค.ศ.)
- 🏭 โรงงาน: "โรง4", "โรง 2", "โรงงาน3"
- 📦 รหัสสินค้า: A35, A42, A13
- 🧱 จำนวนปูน: "=0.7คิว", "จำนวนปูน=1.1คิว", "รวม = 0.7 คิว"

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server info |
| GET | `/health` | Health check + stats |
| POST | `/webhook` | LINE webhook |
| GET | `/api/orders` | ดึง orders (pagination) |
| GET | `/api/summary/:date` | สรุปรายวัน (YYYY-MM-DD) |
| POST | `/api/sync` | Manual sync to Sheets |
| POST | `/api/sheets/init` | สร้าง header row |

### ตัวอย่างการใช้งาน:

```bash
# ดึง orders ล่าสุด
curl http://localhost:3000/api/orders?limit=10

# สรุปวันที่ 21 ม.ค. 2026
curl http://localhost:3000/api/summary/2026-01-21

# Sync ไป Google Sheets
curl -X POST http://localhost:3000/api/sync
```

---

## 📁 โครงสร้างโปรเจค

```
pcc-mo/
├── src/
│   ├── index.js              # Main server
│   ├── database/
│   │   ├── db.js             # Database operations
│   │   └── schema.js         # SQLite schema
│   ├── parser/
│   │   ├── messageParser.js  # Message parsing
│   │   └── messageParser.test.js
│   ├── line/
│   │   ├── lineClient.js     # LINE SDK client
│   │   └── webhook.js        # Webhook handler
│   └── sheets/
│       └── sheetsClient.js   # Google Sheets sync
├── data/
│   └── orders.db             # SQLite database
├── credentials/              # Google credentials (gitignore)
├── package.json
├── .env.example
└── README.md
```

---

## 🧪 ทดสอบ

```bash
# ทดสอบ Message Parser
npm run test:parser

# ทดสอบ Database
npm run test:db
```

---

## 📝 License

MIT
