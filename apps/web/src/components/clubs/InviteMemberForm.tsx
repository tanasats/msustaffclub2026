'use client';

import { useState } from 'react';
import { UserPicker } from '@/components/club-applications/UserPicker';
import { useSave } from '@/components/club-applications/useSave';
import type { PersonRef } from '@/lib/club-application-types';

// กรรมการเชิญบุคลากรเข้าชมรม: เลือกผู้ใช้ + ข้อความถึงผู้ถูกเชิญ (ไม่บังคับ) → ผู้ถูกเชิญตอบรับเอง
export function InviteMemberForm({ clubId, excludeIds }: { clubId: string; excludeIds: string[] }) {
  const { save, pending, error, saved } = useSave();
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [note, setNote] = useState('');

  async function submit() {
    if (!person) return;
    const ok = await save('POST', `/clubs/${clubId}/invitations`, { userId: person.id, ...(note.trim() ? { note: note.trim() } : {}) });
    if (ok) {
      setPerson(null);
      setNote('');
    }
  }

  return (
    <div className="grid gap-2">
      {person ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/[0.08] bg-white px-3 py-2 text-sm">
          <span>
            {person.name ?? person.email}
            <span className="ml-2 text-xs text-stone">{person.orgUnitName ?? person.email}</span>
          </span>
          <button type="button" onClick={() => setPerson(null)} className="text-stone underline">
            เปลี่ยน
          </button>
        </div>
      ) : (
        <UserPicker excludeIds={excludeIds} onSelect={setPerson} placeholder="ค้นหาบุคลากรที่ต้องการเชิญ (ชื่อหรืออีเมล)" />
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="ข้อความถึงผู้ถูกเชิญ (ไม่บังคับ)"
        aria-label="ข้อความถึงผู้ถูกเชิญ"
        className="field"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={!person || pending} className="btn btn-primary">
          {pending ? 'กำลังส่งคำเชิญ...' : 'ส่งคำเชิญ'}
        </button>
        {saved && !error && <span className="text-sm text-matcha-700">ส่งคำเชิญแล้ว</span>}
        {error && <span role="alert" className="text-sm text-beni">{error}</span>}
      </div>
      <p className="text-xs text-stone">ผู้ถูกเชิญต้องตอบรับในระบบก่อนจึงเป็นสมาชิก (ระบบแจ้งทางอีเมลถ้าเปิดการแจ้งเตือนไว้)</p>
    </div>
  );
}
