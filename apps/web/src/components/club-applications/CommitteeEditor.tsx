'use client';

import { useState } from 'react';
import { PRESIDENT_CONSENT_LABELS, type ApplicationDetail, type ClubPosition, type ConsentStatus } from '@/lib/club-application-types';
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
  // สถานะการตอบรับล่าสุดจากฐานข้อมูล (แสดงเท่านั้น)
  consentStatus: ConsentStatus | null;
}

const inputClass = 'field !min-h-10 !px-3 text-sm';
const PRESIDENT = 'president';

// คณะกรรมการบริหาร: ประธาน 1 คน (ผู้ยื่นเองหรือบุคลากรอื่นที่ต้องตอบรับในระบบ) ตำแหน่งอื่นยืดหยุ่น (ตั้งชื่อตำแหน่งเองได้)
export function CommitteeEditor({ application, positions }: { application: ApplicationDetail; positions: ClubPosition[] }) {
  const { save, pending, error, saved } = useSave();
  const committeePositions = positions.filter((p) => p.kind === 'committee');
  const [rows, setRows] = useState<Row[]>(
    application.committee.map((c) => ({
      userId: c.user.id,
      label: c.user.name ?? c.user.email,
      positionCode: c.position.code,
      positionTitle: c.positionTitle,
      workLocation: c.workLocation ?? '',
      contactPhone: c.contactPhone ?? '',
      bio: c.bio ?? '',
      consentStatus: c.consentStatus,
    })),
  );
  const applicantId = application.applicant.id;
  const presidentCount = rows.filter((row) => row.positionCode === PRESIDENT).length;
  const applicantInCommittee = rows.some((row) => row.userId === applicantId);
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
          const isNominee = isPresident && row.userId !== applicantId;
          return (
            <li key={row.userId} className="rounded-xl border border-ink/[0.08] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {row.label}
                    {row.userId === applicantId && <span className="ml-1 font-normal text-stone">(คุณ)</span>}
                  </p>
                  {isNominee && (
                    <p className="mt-0.5 text-xs text-kin">
                      {row.consentStatus ? `${PRESIDENT_CONSENT_LABELS[row.consentStatus]} · ` : ''}
                      ต้องตอบรับในระบบก่อนยื่นคำขอ (ระบบแจ้งเมื่อกด &quot;ส่งขอการตอบรับ&quot;)
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} className="text-sm text-beni underline">
                  ลบ
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={row.positionCode}
                  onChange={(e) => {
                    const position = committeePositions.find((p) => p.code === e.target.value);
                    update(index, { positionCode: e.target.value, positionTitle: position?.nameTh ?? row.positionTitle });
                  }}
                  aria-label="ตำแหน่ง"
                  className={inputClass}
                >
                  {committeePositions.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nameTh}
                    </option>
                  ))}
                </select>
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
      {presidentCount !== 1 && (
        <p role="alert" className="mt-2 text-sm text-beni">
          {presidentCount === 0 ? 'กรุณาเลือกประธานชมรม 1 คน' : 'ประธานชมรมมีได้ 1 คน'}
        </p>
      )}
      {!applicantInCommittee && (
        <p className="mt-2 text-sm text-stone">คุณไม่ได้อยู่ในคณะกรรมการ ระบบจะใส่ชื่อคุณเป็นสมาชิกตั้งต้นของชมรมให้อัตโนมัติ</p>
      )}
      <p className="mt-2 text-xs text-stone">
        เบอร์โทร สถานที่ทำงาน และประวัติย่อ ใช้ในเอกสารจัดตั้งชมรม และเห็นเฉพาะกรรมการ ที่ปรึกษา และสโมสรบุคลากร — กรอกเฉพาะข้อมูลที่เจ้าตัวยินดีให้ใช้ติดต่อ
      </p>
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
                consentStatus: null,
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
