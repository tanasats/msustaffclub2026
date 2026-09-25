'use client';

import { useEffect, useState } from 'react';
import { apiSend } from '@/lib/api-client';
import type { FontScale } from '@/lib/auth';

const OPTIONS: { value: FontScale; label: string; sample: string }[] = [
  { value: 'sm', label: 'เล็ก', sample: 'text-[0.8rem]' },
  { value: 'md', label: 'ปกติ', sample: 'text-[0.95rem]' },
  { value: 'lg', label: 'ใหญ่', sample: 'text-[1.15rem]' },
  { value: 'xl', label: 'ใหญ่มาก', sample: 'text-[1.35rem]' },
];

/**
 * เลือกขนาดตัวอักษร: เปลี่ยนทันทีที่หน้าจอ แล้วบันทึกลงบัญชีผู้ใช้ (จำได้ทุกอุปกรณ์ทุกครั้งที่เข้าระบบ)
 * ถ้าบันทึกไม่สำเร็จ คืนค่าเดิมและแจ้งผู้ใช้
 */
export function FontSizeControl({ initial }: { initial: FontScale }) {
  const [value, setValue] = useState<FontScale>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ซิงก์ค่าที่เลือกไปที่ <html data-font-scale> ให้ทั้งหน้าเปลี่ยนขนาดทันที
  useEffect(() => {
    document.documentElement.dataset.fontScale = value;
  }, [value]);

  async function choose(next: FontScale) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setStatus('saving');
    const result = await apiSend('PATCH', '/me/preferences', { fontScale: next });
    if (result.ok) {
      setStatus('saved');
      return;
    }
    setValue(previous);
    setStatus('error');
  }

  return (
    <fieldset>
      <legend className="mb-1 text-[0.9375rem] text-ink">ขนาดตัวอักษร</legend>
      <p className="mb-3 text-sm text-stone">ระบบจะจำค่านี้ไว้ในบัญชีของคุณ ใช้ได้ทุกอุปกรณ์</p>
      <div role="radiogroup" aria-label="ขนาดตัวอักษร" className="grid grid-cols-4 gap-1.5 rounded-xl bg-cream p-1.5 lg:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.value)}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg transition ${
                selected ? 'bg-white text-matcha-800 shadow-sm ring-1 ring-matcha-200' : 'text-stone hover:bg-white'
              }`}
            >
              <span className={`font-serif leading-none ${option.sample}`} aria-hidden="true">
                ก
              </span>
              <span className="text-xs">{option.label}</span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs">
        {status === 'saving' && <span className="text-mist">กำลังบันทึก...</span>}
        {status === 'saved' && <span className="text-matcha-700">บันทึกแล้ว</span>}
        {status === 'error' && <span className="text-beni">บันทึกไม่สำเร็จ กรุณาลองใหม่</span>}
      </p>
    </fieldset>
  );
}
