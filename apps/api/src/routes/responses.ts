import type { Response } from 'express';

/**
 * ส่งรูปด้วยการ redirect ไป presigned URL อายุสั้น (bucket ยังเป็น private)
 * - หน้าเว็บใช้ <img src> ชี้มาที่ API ได้โดยตรง (cookie ส่งไปด้วยเพราะเป็น site เดียวกัน)
 * - helmet ตั้ง Cross-Origin-Resource-Policy: same-origin ไว้ ซึ่งจะบล็อก <img> จากหน้าเว็บคนละ port
 *   จึงผ่อนเป็น same-site เฉพาะ response นี้
 * - cache ได้สั้นกว่าอายุ URL (URL หมดอายุใน 5 นาที) และเป็น private เพราะต้อง login
 */
export function redirectToImage(res: Response, url: string): void {
  res.set('Cross-Origin-Resource-Policy', 'same-site');
  res.set('Cache-Control', 'private, max-age=240');
  res.redirect(302, url);
}
