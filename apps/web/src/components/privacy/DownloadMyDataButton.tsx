'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { publicEnv } from '@/lib/public-env';

// ดาวน์โหลดข้อมูลของฉันเป็นไฟล์ JSON (สิทธิรับสำเนา/โอนย้ายข้อมูล) — ดึงใหม่จาก API ตอนกดเพื่อให้เป็นข้อมูลล่าสุด
export function DownloadMyDataButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`${publicEnv.apiUrl}/me/data`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ข้อมูลของฉัน-ระบบชมรมบุคลากร-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={download} disabled={pending} className="btn btn-primary w-full sm:w-auto">
        <Icon name="arrowRight" className="size-[1.125rem] rotate-90" />
        {pending ? 'กำลังเตรียมไฟล์...' : 'ดาวน์โหลดข้อมูลทั้งหมด (JSON)'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-beni">
          ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่
        </p>
      )}
    </div>
  );
}
