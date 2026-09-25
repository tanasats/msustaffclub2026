import { publicEnv } from '@/lib/public-env';

type UploadResult = { ok: true; fileId: string } | { ok: false; message: string };

// อัปโหลดไฟล์ 3 ขั้น: ขอ URL จาก API → PUT ตรงไปที่ storage → แจ้ง API ให้ตรวจและยืนยัน
export async function uploadFile(file: File, purpose: 'advisor_consent' | 'club_logo' | 'achievement_evidence'): Promise<UploadResult> {
  const api = publicEnv.apiUrl;
  try {
    const ticketRes = await fetch(`${api}/files/uploads`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
    });
    const ticket = (await ticketRes.json().catch(() => null)) as {
      fileId?: string;
      uploadUrl?: string;
      headers?: Record<string, string>;
      error?: { message?: string };
    } | null;
    if (!ticketRes.ok || !ticket?.fileId || !ticket.uploadUrl) {
      return { ok: false, message: ticket?.error?.message ?? 'ขออัปโหลดไฟล์ไม่สำเร็จ' };
    }
    const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file });
    if (!put.ok) {
      return { ok: false, message: 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่' };
    }
    const done = await fetch(`${api}/files/${ticket.fileId}/complete`, { method: 'POST', credentials: 'include' });
    if (!done.ok) {
      return { ok: false, message: 'ยืนยันการอัปโหลดไม่สำเร็จ กรุณาลองใหม่' };
    }
    return { ok: true, fileId: ticket.fileId };
  } catch {
    return { ok: false, message: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่' };
  }
}
