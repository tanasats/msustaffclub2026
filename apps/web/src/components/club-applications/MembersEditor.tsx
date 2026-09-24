'use client';

import { useState } from 'react';
import type { ApplicationDetail, PersonRef } from '@/lib/club-application-types';
import { SaveBar } from './SaveBar';
import { UserPicker } from './UserPicker';
import { useSave } from './useSave';

// สมาชิกตั้งต้น (นอกเหนือจากกรรมการ ซึ่งนับเป็นสมาชิกโดยอัตโนมัติ)
export function MembersEditor({ application }: { application: ApplicationDetail }) {
  const { save, pending, error, saved } = useSave();
  const [members, setMembers] = useState<PersonRef[]>(application.members);
  const committeeIds = application.committee.map((c) => c.user.id);
  const total = new Set([...committeeIds, ...members.map((m) => m.id)]).size;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PUT', `/club-applications/${application.id}/members`, { memberUserIds: members.map((m) => m.id) });
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-2 text-sm text-slate-600">
        รวมกรรมการแล้ว {total} คน (ขั้นต่ำ 5 คน) — กรรมการ {committeeIds.length} คน นับเป็นสมาชิกโดยอัตโนมัติ
      </p>
      <ul className="mb-3 grid gap-1">
        {members.map((member) => (
          <li key={member.id} className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-sm">
            <span>
              {member.name ?? member.email}
              <span className="ml-2 text-xs text-slate-500">{member.orgUnitName ?? member.email}</span>
            </span>
            <button type="button" onClick={() => setMembers((prev) => prev.filter((m) => m.id !== member.id))} className="text-red-700 underline">
              ลบ
            </button>
          </li>
        ))}
      </ul>
      <UserPicker
        excludeIds={[...committeeIds, ...members.map((m) => m.id)]}
        onSelect={(user) => setMembers((prev) => [...prev, user])}
        placeholder="เพิ่มสมาชิก: ค้นหาชื่อหรืออีเมลบุคลากร"
      />
      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกรายชื่อสมาชิก" />
    </form>
  );
}
