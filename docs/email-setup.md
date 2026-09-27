# ตั้งค่าการส่งอีเมลด้วย Gmail API (staff.club@msu.ac.th)

ระบบส่งอีเมลแจ้งเตือนในนามบัญชี **staff.club@msu.ac.th** ผ่าน Gmail API
ต้องได้ **refresh token** ของบัญชีนี้ 1 ครั้ง ด้วยสคริปต์ `gmail:authorize` แล้วนำไปใส่ใน env ของ API

- สิทธิ์ที่ขอ: `gmail.send` = **ส่งได้อย่างเดียว** อ่าน/ลบอีเมลในกล่องไม่ได้ (และ `openid email` เพื่อยืนยันว่าเป็นบัญชีที่ถูกต้อง)
- ไม่มีรหัสผ่านของบัญชีอยู่ในระบบ เพิกถอนได้ทุกเมื่อที่ https://myaccount.google.com/permissions (login ด้วย staff.club)

## ขั้นที่ 1: Google Cloud Console (ใช้ project เดิมที่ทำ Google Login)

1. **เปิด Gmail API**
   APIs & Services → Library → ค้นหา "Gmail API" → **Enable**
2. **ตรวจ OAuth consent screen** (Google Auth Platform → Branding / Audience)
   - User type เป็น **Internal** (เฉพาะบัญชี msu.ac.th) — ไม่ต้องผ่านการตรวจสอบแอปของ Google
3. **สร้าง OAuth client ใหม่ ชนิด Desktop app** (แยกจาก client ของ Google Login)
   Credentials → Create credentials → OAuth client ID
   - Application type: **Desktop app**
   - Name: `MSU Staff Club Mailer`
   - กด Create → เก็บ **Client ID** และ **Client secret** ไว้ (ใช้ในขั้นที่ 2 และใส่ใน env ของ production)

> ทำไมต้องเป็น Desktop app: สคริปต์รับผลการอนุญาตที่ `http://127.0.0.1:<port>` บนเครื่องที่รัน ซึ่ง Desktop app อนุญาตโดยไม่ต้องลงทะเบียน redirect URI

## ขั้นที่ 2: รันสคริปต์บนเครื่องของคุณ (ที่มี browser และมี repo นี้)

```bash
cd apps/api
GMAIL_CLIENT_ID='xxxxxxxx.apps.googleusercontent.com' \
GMAIL_CLIENT_SECRET='GOCSPX-xxxxxxxx' \
pnpm gmail:authorize
```

สิ่งที่จะเกิดขึ้น
1. browser เปิดหน้า Google → **login ด้วย staff.club@msu.ac.th** (ถ้า browser login บัญชีอื่นอยู่ ให้กด "ใช้บัญชีอื่น")
2. หน้ายินยอม → ติ๊กอนุญาต "ส่งอีเมลในนามของคุณ" → **Continue**
3. หน้า browser ขึ้น "อนุญาตเรียบร้อย" → กลับมาที่ terminal
4. สคริปต์ตรวจว่าเป็นบัญชี staff.club จริง → **ส่งอีเมลทดสอบถึง staff.club@msu.ac.th** → แสดงค่า env

ผลลัพธ์ใน terminal (ตัวอย่าง)
```
2) ยืนยันบัญชี staff.club@msu.ac.th แล้ว
3) ส่งอีเมลทดสอบถึง staff.club@msu.ac.th แล้ว — ตรวจกล่องจดหมายของบัญชีนี้
GMAIL_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=<ค่าเดียวกับที่ใช้รันสคริปต์นี้>
GMAIL_REFRESH_TOKEN=1//0gxxxxxxxx
MAIL_FROM_ADDRESS=staff.club@msu.ac.th
```

5. เปิดกล่องจดหมายของ staff.club ตรวจว่าได้อีเมล "ทดสอบการส่งอีเมลของระบบชมรมบุคลากร"

**refresh token เป็นความลับ** (ผู้ที่ได้ไปส่งอีเมลในนามสโมสรได้) — คัดลอกไปใส่ env ของ production โดยตรง ห้าม commit ห้ามส่งทางแชท
ถ้าหลุด: เพิกถอนที่ https://myaccount.google.com/permissions แล้วรันสคริปต์ใหม่

## ขั้นที่ 3: ใส่ค่าใน production (เมื่อ deploy ระบบอีเมลแล้ว)

เพิ่มใน `/opt/msu-club/env/api.env` (สิทธิ์ 600)
```
MAIL_TRANSPORT=gmail
MAIL_FROM_ADDRESS=staff.club@msu.ac.th
MAIL_FROM_NAME=สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```
แล้วสั่ง `docker compose up -d api` (log ของ API ต้องไม่มีคำเตือน `MAIL_TRANSPORT=log`) จากนั้น
1. super_admin เข้าเมนู **อีเมลแจ้งเตือน** (`/admin/email`) → กด **ส่งอีเมลทดสอบถึงตัวเอง** → ตรวจกล่องจดหมาย
2. ได้รับแล้ว → เปิด **สวิตช์หลัก** → บันทึก (ค่าเริ่มต้นปิดไว้ อีเมลจะไม่ถูกสร้างจนกว่าจะเปิด)
3. ปิดแยกรายเหตุการณ์ได้ในหน้าเดียวกัน, ดูสถานะการส่ง/สาเหตุที่ล้มเหลวได้ที่ตาราง "อีเมลล่าสุด"

## การทำงานของระบบส่งอีเมล (สรุป)

- เหตุการณ์ (เช่น ขอความยินยอม, ส่งรายงาน) ใส่อีเมลลงคิว `email_outbox` ใน transaction เดียวกัน — การส่งล้มเหลวไม่กระทบการทำรายการ
- worker ใน API ส่งจากคิวทุก 30 วินาที (`MAIL_WORKER_INTERVAL_SECONDS`) ส่งไม่ได้ลองใหม่หลัง 1, 5, 15, 60 นาที แล้วเป็น "ส่งไม่สำเร็จ"
- อีเมลที่รอนานเกิน 24 ชั่วโมง (เช่น ปิดสวิตช์ไว้) ถูกยกเลิก ไม่ส่งข่าวเก่า; ประวัติเก็บ 90 วันแล้วลบ
- โหมด `log` ไม่ส่งจริงและไม่เปิด worker (อีเมลในคิวถูกยกเลิกเมื่อเกิน 24 ชั่วโมง)

## ปัญหาที่อาจพบ

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| หน้า Google ขึ้น "Access blocked" / "แอปนี้ถูกบล็อก" | ผู้ดูแล Google Workspace ของมหาวิทยาลัยจำกัดแอป → ขอให้อนุญาต (trust) OAuth client ID นี้ใน Admin console → Security → API controls |
| `Gmail API has not been used in project ...` | ยังไม่ได้ Enable Gmail API (ขั้นที่ 1 ข้อ 1) หรือเพิ่งเปิด รอ 1–2 นาทีแล้วรันใหม่ |
| `login ด้วย ... แต่ต้องเป็น staff.club@msu.ac.th` | เลือกบัญชีผิด → รันใหม่แล้วเลือก staff.club |
| `Google ไม่ส่ง refresh token มา` | เคยอนุญาตไว้แล้ว → เพิกถอนที่ myaccount.google.com/permissions แล้วรันใหม่ |
| `redirect_uri_mismatch` | client ที่ใช้ไม่ใช่ชนิด Desktop app → สร้างใหม่ตามขั้นที่ 1 ข้อ 3 |
| ระบบเคยส่งได้ แล้วส่งไม่ได้ (`invalid_grant`) | token ถูกเพิกถอน หรือเปลี่ยนรหัสผ่าน staff.club → รันสคริปต์ใหม่แล้วแทนค่า `GMAIL_REFRESH_TOKEN` |

ข้อจำกัดของ Google Workspace: ส่งได้ประมาณ 2,000 ฉบับ/วันต่อบัญชี (เกินพอสำหรับการแจ้งเตือนของระบบนี้)
