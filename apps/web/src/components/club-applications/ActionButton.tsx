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
  primary: 'btn btn-primary',
  danger: 'btn btn-danger',
  neutral: 'btn btn-secondary',
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
          className="field"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || (note === 'required' && !text.trim())}
            className={TONES[tone]}
          >
            {pending ? 'กำลังดำเนินการ...' : `ยืนยัน${label}`}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone underline">
            ยกเลิก
          </button>
          {error && <span role="alert" className="text-sm text-beni">{error}</span>}
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
        className={TONES[tone]}
      >
        {pending ? 'กำลังดำเนินการ...' : label}
      </button>
      {error && <span role="alert" className="text-sm text-beni">{error}</span>}
    </div>
  );
}
