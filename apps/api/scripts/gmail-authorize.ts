// ขอ refresh token ของ Gmail API สำหรับบัญชีผู้ส่งอีเมลของระบบ (ทำครั้งเดียว บนเครื่องที่มี browser)
// วิธีใช้: ดู docs/email-setup.md
//   cd apps/api
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... pnpm gmail:authorize
//
// ขั้นตอน: เปิด browser ให้ login บัญชีผู้ส่ง → รับ code ที่ 127.0.0.1 (loopback + PKCE) → แลก token
//          → ตรวจว่าเป็นบัญชีที่ตั้งใจไว้จริง → ส่งอีเมลทดสอบถึงบัญชีนั้น → แสดง refresh token ให้นำไปใส่ใน env
// สคริปต์นี้ไม่โหลด config ของแอป (ไม่ต้องมี env ชุดเต็ม) และไม่บันทึก token ลงไฟล์ใด ๆ
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TIMEOUT_MS = 5 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`ต้องกำหนด ${name} (ได้จาก OAuth client ชนิด Desktop app ใน Google Cloud Console)`);
  }
  return value;
}

// base64 สำหรับหัวอีเมลภาษาไทย (RFC 2047) และเนื้อหา
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

function testMessage(from: string, fromName: string): string {
  const body = [
    'อีเมลทดสอบจากระบบบริหารจัดการชมรมบุคลากร มหาวิทยาลัยมหาสารคาม',
    '',
    'ถ้าคุณได้รับอีเมลนี้ แสดงว่าการตั้งค่า Gmail API สำหรับส่งอีเมลแจ้งเตือนใช้งานได้แล้ว',
    `ส่งเมื่อ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
  ].join('\r\n');
  const mime = [
    `From: =?UTF-8?B?${b64(fromName)}?= <${from}>`,
    `To: ${from}`,
    `Subject: =?UTF-8?B?${b64('ทดสอบการส่งอีเมลของระบบชมรมบุคลากร')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body),
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

// เปิด browser ให้อัตโนมัติ (ไม่สำเร็จก็ไม่เป็นไร ผู้ใช้คัดลอกลิงก์ไปเปิดเองได้)
function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(command, [url], () => {});
}

// รอ Google redirect กลับมาที่ 127.0.0.1 แล้วคืน code (ตรวจ state กันการปลอม)
function waitForCode(server: http.Server, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('หมดเวลา 5 นาที — รันสคริปต์ใหม่อีกครั้ง')), TIMEOUT_MS);
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const done = (message: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:2rem">${message}</p>`);
      };
      clearTimeout(timer);
      const error = url.searchParams.get('error');
      if (error) {
        done('ไม่ได้รับอนุญาต — กลับไปดูข้อความใน terminal');
        reject(new Error(`Google ปฏิเสธ: ${error}`));
      } else if (url.searchParams.get('state') !== state) {
        done('state ไม่ตรงกัน — กลับไปดูข้อความใน terminal');
        reject(new Error('state ไม่ตรงกัน (อาจเปิดลิงก์เก่า) — รันสคริปต์ใหม่'));
      } else {
        done('อนุญาตเรียบร้อย ปิดหน้าต่างนี้แล้วกลับไปที่ terminal ได้เลย');
        resolve(url.searchParams.get('code') ?? '');
      }
    });
  });
}

async function main(): Promise<void> {
  const clientId = requireEnv('GMAIL_CLIENT_ID');
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET');
  const sender = (process.env.MAIL_FROM_ADDRESS?.trim() || 'staff.club@msu.ac.th').toLowerCase();
  const senderName = process.env.MAIL_FROM_NAME?.trim() || 'สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม';

  // port สุ่มบน 127.0.0.1 (OAuth client ชนิด Desktop app อนุญาต loopback ทุก port)
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const client = new OAuth2Client({ clientId, clientSecret, redirectUri: `http://127.0.0.1:${port}/callback` });
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString('hex');
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      // บังคับหน้ายินยอมทุกครั้ง เพื่อให้ได้ refresh token ใหม่เสมอ
      prompt: 'consent',
      // openid email ใช้ตรวจว่า login ด้วยบัญชีผู้ส่งจริง, gmail.send = ส่งได้อย่างเดียว อ่านกล่องจดหมายไม่ได้
      scope: ['openid', 'email', SEND_SCOPE],
      login_hint: sender,
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeChallenge,
    });

    console.log(`\n1) กำลังเปิด browser — ให้ login ด้วย ${sender} แล้วกด "อนุญาต"`);
    console.log('   ถ้า browser ไม่เปิดเอง ให้คัดลอกลิงก์นี้ไปเปิด:\n');
    console.log(`   ${authUrl}\n`);
    openBrowser(authUrl);

    const code = await waitForCode(server, state);
    const { tokens } = await client.getToken({ code, codeVerifier });

    // ตรวจบัญชีจาก ID token (ลายเซ็น + aud) ก่อนแสดง token — กันเผลอ login ด้วยบัญชีส่วนตัว
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token ?? '', audience: clientId });
    const email = ticket.getPayload()?.email?.toLowerCase();
    if (email !== sender) {
      throw new Error(`login ด้วย ${email ?? '(ไม่ทราบ)'} แต่ต้องเป็น ${sender} — รันใหม่แล้วเลือกบัญชีให้ถูก`);
    }
    if (!tokens.refresh_token) {
      throw new Error('Google ไม่ส่ง refresh token มา — เพิกถอนสิทธิ์เดิมที่ https://myaccount.google.com/permissions แล้วรันใหม่');
    }
    if (!tokens.scope?.split(' ').includes(SEND_SCOPE)) {
      throw new Error('ไม่ได้รับสิทธิ์ส่งอีเมล (gmail.send) — ต้องติ๊กอนุญาตทุกข้อในหน้ายินยอม');
    }
    console.log(`2) ยืนยันบัญชี ${email} แล้ว`);

    client.setCredentials(tokens);
    await client.request({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: testMessage(sender, senderName) },
    });
    console.log(`3) ส่งอีเมลทดสอบถึง ${sender} แล้ว — ตรวจกล่องจดหมายของบัญชีนี้`);

    console.log('\n4) นำค่าต่อไปนี้ไปใส่ใน env ของ API (production: /opt/msu-club/env/api.env) — เป็นความลับ ห้าม commit/ส่งต่อ\n');
    console.log(`GMAIL_CLIENT_ID=${clientId}`);
    console.log('GMAIL_CLIENT_SECRET=<ค่าเดียวกับที่ใช้รันสคริปต์นี้>');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`MAIL_FROM_ADDRESS=${sender}\n`);
  } finally {
    server.close();
  }
}

main().catch((err: unknown) => {
  console.error(`\nไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
