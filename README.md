[README.md](https://github.com/user-attachments/files/26238031/README.md)
# 🚀 Finsight — Deploy Guide

## โครงสร้างโปรเจกต์

```
finance-dashboard/
├── index.html      ← หน้าหลัก Dashboard
├── style.css       ← Styling (Dark theme)
├── script.js       ← Frontend logic
├── Code.gs         ← Google Apps Script (Backend)
└── README.md       ← คู่มือนี้
```

---

## ขั้นตอนที่ 1 — ตั้งค่า Google Sheets

1. ไปที่ [sheets.google.com](https://sheets.google.com) → สร้าง Spreadsheet ใหม่
2. ตั้งชื่อ Sheet ว่า **Transactions**
3. คัดลอก **Spreadsheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_อยู่ตรงนี้]/edit
   ```

---

## ขั้นตอนที่ 2 — Deploy Google Apps Script

1. ใน Google Sheet → ไปที่ **Extensions → Apps Script**
2. ลบโค้ดเดิมออก แล้ว **วางโค้ดจาก Code.gs** ทั้งหมด
3. แก้ค่า `SHEET_ID` บรรทัดที่ 10:
   ```js
   const SHEET_ID = 'วาง-ID-ของคุณ-ที่นี่';
   ```
4. กด **Save** (Ctrl+S)
5. เลือก function `setupSheet` จาก dropdown → กด **Run**
   - ระบบจะขอ Permission → กด Allow
   - จะสร้าง Header บน Sheet อัตโนมัติ
6. Deploy เป็น Web App:
   - คลิก **Deploy → New deployment**
   - เลือก Type: **Web app**
   - ตั้งค่า:
     - Execute as: **Me**
     - Who has access: **Anyone** (สำคัญมาก!)
   - กด **Deploy**
7. คัดลอก **Web App URL** ที่ได้ (รูปแบบ: `https://script.google.com/macros/s/.../exec`)

---

## ขั้นตอนที่ 3 — เชื่อม Frontend กับ GAS

เปิดไฟล์ `script.js` บรรทัดที่ 9:
```js
const GAS_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
```
แก้เป็น URL จากขั้นตอนที่ 2 ขั้นตอนที่ 7

---

## ขั้นตอนที่ 4 — Deploy บน GitHub Pages

```bash
# 1. สร้าง Repository บน GitHub (ชื่ออะไรก็ได้ เช่น finance-dashboard)

# 2. Push ไฟล์ขึ้น GitHub
git init
git add index.html style.css script.js
git commit -m "Initial commit: Finsight Dashboard"
git remote add origin https://github.com/YOUR_USERNAME/finance-dashboard.git
git push -u origin main

# 3. เปิด GitHub Pages
# ไปที่ Settings → Pages
# Source: Deploy from branch → main → / (root) → Save

# 4. รอ 1-2 นาที → เว็บจะขึ้นที่:
# https://YOUR_USERNAME.github.io/finance-dashboard/
```

---

## โครงสร้าง Google Sheet (สร้างอัตโนมัติ)

| A: Date    | B: Type | C: Amount | D: Category | E: Note     |
|------------|---------|-----------|-------------|-------------|
| 2025-01-15 | Income  | 45000     | Salary      | Monthly pay |
| 2025-01-16 | Expense | 350       | Food        | Lunch       |

---

## ⚠️ หมายเหตุสำคัญ

- **Demo Mode**: ถ้ายังไม่ตั้งค่า `GAS_URL` แอพจะทำงานด้วยข้อมูลตัวอย่างและ**ไม่บันทึก**ลง Sheets
- **CORS**: GAS Web App ต้องตั้ง Access เป็น **Anyone** ถึงจะเรียกจาก GitHub Pages ได้
- **Re-deploy**: ทุกครั้งที่แก้โค้ด GAS ต้อง **Deploy ใหม่** (New deployment) ถึงจะมีผล
- **ทดสอบ GAS**: เปิด URL ตรง ๆ ใน browser → จะเห็น `{"status":"ok","message":"Finsight API is running"}`
