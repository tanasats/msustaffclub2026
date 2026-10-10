'use client';

import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// สวิตช์รับอีเมลแจ้งเตือน (บันทึกในบัญชีผู้ใช้) — บันทึกไม่สำเร็จ คืนค่าเดิมและแจ้งผู้ใช้
export function EmailNotificationPreference({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setStatus('saving');
    const result = await apiSend('PATCH', '/me/preferences', { emailNotifications: next });
    if (result.ok) {
      setStatus('idle');
      return;
    }
    setEnabled(!next);
    setStatus('error');
  }

  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <span id="email-pref-label">
          <span className="block text-[0.9375rem] text-ink">รับอีเมลแจ้งเตือน</span>
          <span className="block text-sm text-stone">ส่งไปที่อีเมล @msu.ac.th ของคุณ</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="email-pref-label"
          disabled={status === 'saving'}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${enabled ? 'bg-matcha-700' : 'bg-ink/15'}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {!enabled && (
        <p className="mt-2 rounded-xl border border-kin/20 bg-kin-50 px-3 py-2 text-sm text-kin">
          ปิดรับอีเมลอยู่ — เรื่องที่รอคุณดำเนินการ (เช่น ถูกเสนอชื่อเป็นที่ปรึกษา) จะแจ้งที่กระดิ่งในระบบเท่านั้น กรุณาเข้าระบบตรวจเป็นระยะ
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-beni">
          บันทึกไม่สำเร็จ กรุณาลองใหม่
        </p>
      )}
    </div>
  );
}
