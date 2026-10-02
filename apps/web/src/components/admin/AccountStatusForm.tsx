'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';

// ปิดบัญชี (พ้นจากมหาวิทยาลัย) / เปิดบัญชีคืน — ต้องมีเหตุผล กดครั้งแรกเปิดช่องกรอก กดยืนยันจึงส่ง
export function AccountStatusForm({ userId, mode }: { userId: string; mode: 'deactivate' | 'reactivate' }) {
  const { save, pending, error } = useSave();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const label = mode === 'deactivate' ? 'ปิดบัญชี (พ้นจากมหาวิทยาลัย)' : 'เปิดบัญชีคืน';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={mode === 'deactivate' ? 'btn btn-danger' : 'btn btn-secondary'}>
        {label}
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={mode === 'deactivate' ? 'เหตุผล เช่น เกษียณอายุราชการ 30 ก.ย. 2569 / ลาออก / โอนย้าย (จำเป็น)' : 'เหตุผล (จำเป็น)'}
        aria-label={`เหตุผล${label}`}
        className="field"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => save('POST', `/user-accounts/${userId}/${mode}`, { reason })}
          disabled={pending || !reason.trim()}
          className={mode === 'deactivate' ? 'btn btn-danger' : 'btn btn-primary'}
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
