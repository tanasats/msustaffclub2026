'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { apiGetClient } from '@/lib/api-client';

// เปิดไฟล์: ขอ URL ดาวน์โหลดอายุสั้นจาก API (ตรวจสิทธิ์ทุกครั้ง) แล้วเปิดในแท็บใหม่
export function FileLink({ fileId, label }: { fileId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function open() {
    setPending(true);
    setFailed(false);
    // เปิดแท็บก่อนรอผล (เบราว์เซอร์บล็อก popup ที่เปิดหลัง await)
    const tab = window.open('', '_blank');
    const data = await apiGetClient<{ url: string }>(`/files/${fileId}/download-url`);
    setPending(false);
    if (!data || !tab) {
      tab?.close();
      setFailed(true);
      return;
    }
    tab.location.href = data.url;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-matcha-700 underline"
      >
        <Icon name="scroll" className="size-4" />
        {pending ? 'กำลังเปิด...' : label}
      </button>
      {failed && <span className="text-xs text-beni">เปิดไฟล์ไม่สำเร็จ</span>}
    </span>
  );
}
