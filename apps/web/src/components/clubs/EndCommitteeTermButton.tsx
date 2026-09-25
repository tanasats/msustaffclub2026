'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import { COMMITTEE_END_REASONS } from '@/lib/committee-labels';

type Reason = (typeof COMMITTEE_END_REASONS)[number]['value'];

// ให้กรรมการพ้นตำแหน่ง (ระเบียบข้อ 12): เลือกเหตุ + คำอธิบาย (จำเป็น) — ยังเป็นสมาชิกชมรมต่อ
export function EndCommitteeTermButton({ clubId, committeeMemberId, memberName }: { clubId: string; committeeMemberId: string; memberName: string }) {
  const { save, pending, error } = useSave();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('term_ended');
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-beni underline">
        ให้พ้นตำแหน่ง
      </button>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded-xl border border-beni/20 bg-beni-50 p-3">
      <p className="text-sm font-medium text-beni">ให้ {memberName} พ้นจากตำแหน่งกรรมการ</p>
      <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} aria-label="เหตุที่พ้นตำแหน่ง" className="field !min-h-10 text-sm">
        {COMMITTEE_END_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="คำอธิบาย (จำเป็น) เช่น มติที่ประชุมครั้งที่ ..."
        aria-label="คำอธิบาย"
        className="field !min-h-10 text-sm"
      />
      <p className="text-xs text-stone">ผู้นี้ยังเป็นสมาชิกชมรมต่อไป</p>
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => save('POST', `/clubs/${clubId}/committee/${committeeMemberId}/end`, { reason, note })}
          className="btn btn-danger !min-h-10 text-sm"
        >
          {pending ? 'กำลังบันทึก...' : 'ยืนยันให้พ้นตำแหน่ง'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
