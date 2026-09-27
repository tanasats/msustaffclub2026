import { randomBytes } from 'node:crypto';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// base64 แบ่งบรรทัดละ 76 ตัวอักษรตาม RFC 2045
const base64Lines = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
// หัวอีเมลที่มีภาษาไทย (RFC 2047 encoded-word)
const encodedWord = (text: string) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

/**
 * สร้างอีเมล MIME แบบ multipart/alternative (ข้อความล้วน + HTML) แล้วเข้ารหัส base64url ตามที่ Gmail API ต้องการ
 * ห้ามมีขึ้นบรรทัดใหม่ในค่าหัวอีเมล (กัน header injection)
 */
export function buildRawMessage(from: { address: string; name: string }, message: MailMessage): string {
  for (const value of [from.address, from.name, message.to, message.subject]) {
    if (/[\r\n]/.test(value)) throw new Error('หัวอีเมลมีอักขระขึ้นบรรทัดใหม่');
  }
  const boundary = `msu-club-${randomBytes(12).toString('hex')}`;
  const mime = [
    `From: ${encodedWord(from.name)} <${from.address}>`,
    `To: ${message.to}`,
    `Subject: ${encodedWord(message.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(message.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}
