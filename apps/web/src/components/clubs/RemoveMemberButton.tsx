'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';

// เหตุพ้นสภาพที่กรรมการกำหนดได้ (ระเบียบข้อ 20) ต้องตรงกับ REMOVAL_REASONS ของ API
const REASONS = [
  { value: 'removed_by_resolution', label: 'มติที่ประชุมคณะกรรมการให้ออก' },
  { value: 'disciplinary', label: 'ต้องโทษวินัย' },
  { value: 'left_university', label: 'ลาออกจากมหาวิทยาลัย' },
  { value: 'deceased', label: 'ถึงแก่กรรม' },
] as const;

export function RemoveMemberButton({ clubId, membershipId, memberName }: { clubId: string; membershipId: string; memberName: string }) {
  const { save, pending, error } = useSave();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('removed_by_resolution');
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-beni underline">
        ให้พ้นสภาพ
      </button>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded-xl border border-beni/20 bg-beni-50 p-3">
      <p className="text-sm font-medium text-beni">ให้ {memberName} พ้นสภาพสมาชิก</p>
      <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-label="เหตุที่พ้นสภาพ" className="field !min-h-10 text-sm">
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="คำอธิบาย (จำเป็น) เช่น มติที่ประชุมครั้งที่ ..." aria-label="คำอธิบาย" className="field !min-h-10 text-sm" />
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => save('POST', `/clubs/${clubId}/memberships/${membershipId}/remove`, { reason, note })}
          className="btn btn-danger !min-h-10 text-sm"
        >
          {pending ? 'กำลังบันทึก...' : 'ยืนยันให้พ้นสภาพ'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
