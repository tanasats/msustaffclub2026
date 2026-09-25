'use client';

import { useState } from 'react';
import type { ApplicationDetail, ClubPosition } from '@/lib/club-application-types';
import { SaveBar } from './SaveBar';
import { UserPicker } from './UserPicker';
import { useSave } from './useSave';

interface Row {
  userId: string;
  label: string;
  positionCode: string;
  positionTitle: string;
  workLocation: string;
  contactPhone: string;
  bio: string;
}

const inputClass = 'field !min-h-10 !px-3 text-sm';
const PRESIDENT = 'president';

// คณะกรรมการบริหาร: ผู้ยื่นเป็นประธานเสมอ ตำแหน่งอื่นยืดหยุ่น (ตั้งชื่อตำแหน่งเองได้)
export function CommitteeEditor({ application, positions }: { application: ApplicationDetail; positions: ClubPosition[] }) {
  const { save, pending, error, saved } = useSave();
  const committeePositions = positions.filter((p) => p.kind === 'committee');
  const selectable = committeePositions.filter((p) => p.code !== PRESIDENT);
  const [rows, setRows] = useState<Row[]>(
    application.committee.map((c) => ({
      userId: c.user.id,
      label: c.user.name ?? c.user.email,
      positionCode: c.position.code,
      positionTitle: c.positionTitle,
      workLocation: c.workLocation ?? '',
      contactPhone: c.contactPhone ?? '',
      bio: c.bio ?? '',
    })),
  );
  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PUT', `/club-applications/${application.id}/committee`, {
      committee: rows.map((row) => ({
        userId: row.userId,
        positionCode: row.positionCode,
        positionTitle: row.positionTitle,
        workLocation: row.workLocation,
        contactPhone: row.contactPhone,
        bio: row.bio,
      })),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ul className="grid gap-3">
        {rows.map((row, index) => {
          const isPresident = row.positionCode === PRESIDENT;
          return (
            <li key={row.userId} className="rounded-xl border border-ink/[0.08] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{row.label}</p>
                {!isPresident && (
                  <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} className="text-sm text-beni underline">
                    ลบ
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {isPresident ? (
                  <p className="text-sm text-stone">ตำแหน่ง: ประธานชมรม (ผู้ยื่นคำขอ)</p>
                ) : (
                  <select
                    value={row.positionCode}
                    onChange={(e) => {
                      const position = selectable.find((p) => p.code === e.target.value);
                      update(index, { positionCode: e.target.value, positionTitle: position?.nameTh ?? row.positionTitle });
                    }}
                    aria-label="ตำแหน่ง"
                    className={inputClass}
                  >
                    {selectable.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.nameTh}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={row.positionTitle}
                  onChange={(e) => update(index, { positionTitle: e.target.value })}
                  placeholder="ชื่อตำแหน่งที่แสดง เช่น รองประธานคนที่ 1"
                  aria-label="ชื่อตำแหน่งที่แสดง"
                  maxLength={200}
                  className={inputClass}
                />
                <input
                  value={row.workLocation}
                  onChange={(e) => update(index, { workLocation: e.target.value })}
                  placeholder="สถานที่ทำงาน"
                  aria-label="สถานที่ทำงาน"
                  maxLength={500}
                  className={inputClass}
                />
                <input
                  value={row.contactPhone}
                  onChange={(e) => update(index, { contactPhone: e.target.value })}
                  placeholder="เบอร์โทร"
                  aria-label="เบอร์โทร"
                  maxLength={50}
                  className={inputClass}
                />
              </div>
              <textarea
                value={row.bio}
                onChange={(e) => update(index, { bio: e.target.value })}
                placeholder="ประวัติโดยย่อ"
                aria-label="ประวัติโดยย่อ"
                rows={2}
                maxLength={5000}
                className={`${inputClass} mt-2 w-full`}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <UserPicker
          excludeIds={rows.map((row) => row.userId)}
          onSelect={(user) =>
            setRows((prev) => [
              ...prev,
              {
                userId: user.id,
                label: user.name ?? user.email,
                positionCode: 'committee_member',
                positionTitle: 'กรรมการ',
                workLocation: user.orgUnitName ?? '',
                contactPhone: '',
                bio: '',
              },
            ])
          }
          placeholder="เพิ่มกรรมการ: ค้นหาชื่อหรืออีเมลบุคลากร"
        />
      </div>
      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกคณะกรรมการ" />
    </form>
  );
}
