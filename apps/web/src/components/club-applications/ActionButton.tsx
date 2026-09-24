'use client';

import { useState } from 'react';
import { useSave } from './useSave';

interface ActionButtonProps {
  path: string;
  label: string;
  // ค่าคงที่ที่ส่งไปใน body (เช่น { decision: 'approve' })
  body?: Record<string, string>;
  // 'required' = ต้องกรอกเหตุผล, 'optional' = กรอกหรือไม่ก็ได้, undefined = ไม่มีช่องหมายเหตุ
  note?: 'required' | 'optional';
  tone?: 'primary' | 'danger' | 'neutral';
  disabled?: boolean;
}

const TONES = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  danger: 'bg-red-700 text-white hover:bg-red-600',
  neutral: 'border border-slate-300 bg-white hover:bg-slate-50',
};

// ปุ่มเปลี่ยนสถานะคำขอ: ถ้ามีช่องหมายเหตุ กดครั้งแรกเปิดช่องกรอก กดยืนยันจึงส่ง
export function ActionButton({ path, label, body = {}, note, tone = 'primary', disabled = false }: ActionButtonProps) {
  const { save, pending, error } = useSave();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = () => save('POST', path, note ? { ...body, note: text } : body);

  if (note && open) {
    return (
      <div className="grid w-full gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={note === 'required' ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ (ถ้ามี)'}
          aria-label={`หมายเหตุสำหรับ ${label}`}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || (note === 'required' && !text.trim())}
            className={`rounded-md px-4 py-2 text-sm disabled:opacity-50 ${TONES[tone]}`}
          >
            {pending ? 'กำลังดำเนินการ...' : `ยืนยัน${label}`}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-600 underline">
            ยกเลิก
          </button>
          {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={note ? () => setOpen(true) : submit}
        disabled={pending || disabled}
        className={`rounded-md px-4 py-2 text-sm disabled:opacity-50 ${TONES[tone]}`}
      >
        {pending ? 'กำลังดำเนินการ...' : label}
      </button>
      {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
    </div>
  );
}
