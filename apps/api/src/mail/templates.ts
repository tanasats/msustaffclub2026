import type { MailMessage } from './mime.js';

// แม่แบบอีเมลแจ้งเตือน (ภาษาไทย สั้น มีลิงก์ตรงไปหน้าที่เกี่ยวข้อง) — ไม่ใส่ข้อมูลส่วนบุคคลเกินจำเป็น
export type EmailContent = Omit<MailMessage, 'to'>;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FOOTER =
  'อีเมลนี้ส่งอัตโนมัติจากระบบบริหารจัดการชมรมบุคลากร สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม กรุณาอย่าตอบกลับ — ปิดรับอีเมลแจ้งเตือนได้ที่หน้า "การตั้งค่า" ในระบบ';

/**
 * ประกอบอีเมล: ทักทาย + ย่อหน้า + ปุ่มลิงก์ ทั้งแบบ HTML (inline style ตามข้อจำกัดของโปรแกรมอ่านอีเมล) และข้อความล้วน
 */
export function composeEmail(input: {
  subject: string;
  recipientName: string | null;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
}): EmailContent {
  const greeting = input.recipientName ? `เรียน คุณ${input.recipientName}` : 'เรียน ท่านผู้เกี่ยวข้อง';
  const text = [greeting, '', ...input.paragraphs.flatMap((p) => [p, '']), `${input.actionLabel}: ${input.actionUrl}`, '', '—', FOOTER].join('\n');
  const html = `<!doctype html><html lang="th"><body style="margin:0;padding:24px;background:#faf8f3;font-family:Tahoma,sans-serif;color:#2a2b26">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6ddcb;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;color:#334a2a;font-weight:bold">สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
${input.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.6">${escapeHtml(p)}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#334a2a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px">${escapeHtml(input.actionLabel)}</a></p>
<p style="margin:0;font-size:13px;color:#58544b">หรือเปิดลิงก์: ${escapeHtml(input.actionUrl)}</p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#58544b">${escapeHtml(FOOTER)}</p>
</body></html>`;
  return { subject: input.subject, text, html };
}
