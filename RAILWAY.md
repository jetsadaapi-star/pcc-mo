# Deploy PCC-MO ไป Railway

## ขั้นตอนการ Deploy

### 1. สร้างโปรเจคบน Railway

1. ไปที่ [railway.app](https://railway.app) และล็อกอิน
2. คลิก **New Project** → **Deploy from GitHub repo**
3. เลือก repo ของโปรเจค pcc-mo

### 2. เพิ่ม Volume (สำหรับเก็บ Database)

1. เปิด Service ที่สร้างขึ้น → แท็บ **Volumes**
2. คลิก **+ New Volume**
3. ตั้งค่า **Mount Path** เป็น `/data`
4. Railway จะ mount volume ที่ `/data` ให้อัตโนมัติ

> ⚠️ ไม่มี Volume = ข้อมูล SQLite หายทุกครั้งที่ redeploy

### 3. ตั้งค่า Environment Variables

ไปที่แท็บ **Variables** แล้วเพิ่มตัวแปรดังนี้:

| Variable | Value | หมายเหตุ |
|----------|-------|----------|
| `DATA_DIR` | `/data` | โฟลเดอร์เก็บ database (ต้องตรงกับ Volume mount) |
| `PORT` | *(ไม่ต้องใส่)* | Railway กำหนดให้อัตโนมัติ |
| `ENABLE_REPLY_MESSAGE` | `true` | เปิดการตอบกลับข้อความ |
| `LINE_CHANNEL_ACCESS_TOKEN` | `LEBYmLKla...` | จาก LINE Developers |
| `LINE_CHANNEL_SECRET` | `99c9a883...` | จาก LINE Developers |
| `GOOGLE_SHEETS_ID` | `1d0ycnpAsjO5ff123_3v0nbhEYEqptEW3nsZ3nt2e1Fk` | ID ของ Google Sheet |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | *(ดูด้านล่าง)* | เนื้อหา JSON ทั้งหมด |

### 4. ตั้งค่า Google Service Account (สำหรับ Railway)

Railway ไม่มีไฟล์ระบบ ดังนั้นต้องใส่ credentials เป็น JSON string ใน env:

**วิธีที่ 1: ใช้ GOOGLE_APPLICATION_CREDENTIALS_JSON**  
- คัดลอกเนื้อหาทั้งหมดจากไฟล์ `credentials/google-service-account.json`
- วางเป็น **ค่าเดียว** (minify เป็นบรรทัดเดียว หรือใช้ RAW editor ของ Railway)
- ตัวอย่างรูปแบบ: `{"type":"service_account","project_id":"jets2-9ee6b",...}`

**วิธีที่ 2: ใช้ Base64 (แนะนำ - หลีกเลี่ยงปัญหา special characters)**

```powershell
# PowerShell - สร้าง Base64 จากไฟล์
[Convert]::ToBase64String([IO.File]::ReadAllBytes("credentials/google-service-account.json"))
```

ตั้งค่า env:
| Variable | Value |
|----------|-------|
| `GOOGLE_APPLICATION_CREDENTIALS_BASE64` | *(ผลลัพธ์จากคำสั่งด้านบน)* |

> ถ้าใช้ Base64 แล้ว ไม่ต้องตั้ง `GOOGLE_APPLICATION_CREDENTIALS_JSON`

### 5. ตั้งค่า Webhook ของ LINE

1. หลัง Deploy เสร็จ ไปที่แท็บ **Settings** → **Networking** → **Generate Domain**
2. จะได้ URL เช่น `https://pcc-mo-production-xxxx.up.railway.app`
3. ไปที่ [LINE Developers Console](https://developers.line.biz) → Channel ของคุณ
4. Messaging API → ตั้ง **Webhook URL** เป็น:  
   `https://YOUR-RAILWAY-URL/webhook`
5. เปิดใช้ Webhook

---

## สรุป Environment Variables ที่ต้องมี

```
DATA_DIR=/data
ENABLE_REPLY_MESSAGE=true
LINE_CHANNEL_ACCESS_TOKEN=LEBYmLKlaLm6mvLb9IMMD7zD6wtVsYpjfLVTIS572/...
LINE_CHANNEL_SECRET=99c9a88314a393ad1fd7331c5c986d2f
GOOGLE_SHEETS_ID=1d0ycnpAsjO5ff123_3v0nbhEYEqptEW3nsZ3nt2e1Fk
GOOGLE_APPLICATION_CREDENTIALS_BASE64=<base64 ของไฟล์ JSON>
```

---

## Build & Start Command

Railway จะตรวจจับ Node.js อัตโนมัติจาก `package.json`  
- **Build:** `npm install`
- **Start:** `npm start`

---

## ตรวจสอบหลัง Deploy

1. เปิด URL ที่ได้ → ควรเห็น Dashboard
2. ไปที่ `/settings` → กด **ทดสอบการเชื่อมต่อ Google Sheets**
3. ไปที่ `/health` → ตรวจสอบว่า database และ Google Sheets ทำงานได้
