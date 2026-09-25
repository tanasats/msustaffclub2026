'use client';

import { useState } from 'react';
import { FileLink } from '@/components/files/FileLink';
import { Badge } from '@/components/ui/Badge';
import type { ApplicationDetail, ExternalPerson } from '@/lib/club-application-types';
import { CONSENT_LABELS } from '@/lib/club-application-types';
import { ConsentUpload } from './ConsentUpload';
import { SaveBar } from './SaveBar';
import { UserPicker } from './UserPicker';
import { useSave } from './useSave';

type AdvisorDraft =
  | { kind: 'internal'; key: string; label: string; email: string; userId: string | null; consent?: string }
  | { kind: 'external'; key: string; externalPersonId: string | null; person: ExternalPerson };

const MAX_ADVISORS = 2;
const EMPTY_PERSON: ExternalPerson = {
  prefixTh: '',
  firstNameTh: '',
  lastNameTh: '',
  organization: '',
  position: '',
  email: '',
  phone: '',
};

// แปลงข้อความว่างเป็น null ก่อนส่ง API
const orNull = (value: string | null) => (value && value.trim() ? value.trim() : null);

function ExternalPersonFields({ value, onChange }: { value: ExternalPerson; onChange: (next: ExternalPerson) => void }) {
  const set = (key: keyof ExternalPerson) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-6">
      <input value={value.prefixTh ?? ''} onChange={set('prefixTh')} placeholder="คำนำหน้า" aria-label="คำนำหน้า" maxLength={50} className="field sm:col-span-1" />
      <input value={value.firstNameTh} onChange={set('firstNameTh')} placeholder="ชื่อ *" aria-label="ชื่อ" maxLength={100} className="field sm:col-span-2" />
      <input value={value.lastNameTh} onChange={set('lastNameTh')} placeholder="นามสกุล *" aria-label="นามสกุล" maxLength={100} className="field sm:col-span-3" />
      <input value={value.organization} onChange={set('organization')} placeholder="หน่วยงาน/องค์กร *" aria-label="หน่วยงานหรือองค์กร" maxLength={300} className="field sm:col-span-4" />
      <input value={value.position ?? ''} onChange={set('position')} placeholder="ตำแหน่ง" aria-label="ตำแหน่ง" maxLength={200} className="field sm:col-span-2" />
      <input type="email" value={value.email ?? ''} onChange={set('email')} placeholder="อีเมล" aria-label="อีเมล" maxLength={200} className="field sm:col-span-3" />
      <input value={value.phone ?? ''} onChange={set('phone')} placeholder="เบอร์โทร" aria-label="เบอร์โทร" maxLength={50} className="field sm:col-span-3" />
      <p className="text-xs text-mist sm:col-span-6">* จำเป็น และต้องมีอีเมลหรือเบอร์โทรอย่างน้อย 1 ช่องทาง</p>
    </div>
  );
}

// ที่ปรึกษา ≤ 2 คน (ต้องมีบุคลากรอย่างน้อย 1 คน): บุคลากรยินยอมผ่านการเข้าสู่ระบบ บุคคลภายนอกแนบใบคำยินยอม
export function AdvisorsEditor({ application }: { application: ApplicationDetail }) {
  const { save, pending, error, saved } = useSave();
  const [advisors, setAdvisors] = useState<AdvisorDraft[]>(
    application.advisors.map((a): AdvisorDraft =>
      a.external
        ? { kind: 'external', key: `ext:${a.external.id}`, externalPersonId: a.external.id, person: a.external }
        : {
            kind: 'internal',
            key: `email:${a.email}`,
            label: a.user?.name ?? a.email ?? '',
            email: a.email ?? '',
            userId: a.user?.id ?? null,
            consent: CONSENT_LABELS[a.consentStatus],
          },
    ),
  );
  const [email, setEmail] = useState('');
  const [newPerson, setNewPerson] = useState<ExternalPerson | null>(null);
  // ข้อมูลที่บันทึกแล้ว (ใช้แสดงไฟล์คำยินยอม ซึ่งแนบได้หลังบันทึกรายชื่อแล้วเท่านั้น)
  const savedByKey = new Map(
    application.advisors.map((a) => [a.external ? `ext:${a.external.id}` : `email:${a.email}`, a]),
  );
  const canAdd = advisors.length < MAX_ADVISORS;

  const add = (draft: AdvisorDraft) => {
    if (!canAdd || advisors.some((a) => a.key === draft.key)) return;
    setAdvisors((prev) => [...prev, draft]);
  };
  const updatePerson = (key: string, person: ExternalPerson) =>
    setAdvisors((prev) => prev.map((a) => (a.key === key && a.kind === 'external' ? { ...a, person } : a)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PUT', `/club-applications/${application.id}/advisors`, {
      advisors: advisors.map((a) => {
        if (a.kind === 'internal') return a.userId ? { userId: a.userId } : { email: a.email };
        const p = a.person;
        const external = {
          prefixTh: orNull(p.prefixTh),
          firstNameTh: p.firstNameTh.trim(),
          lastNameTh: p.lastNameTh.trim(),
          organization: p.organization.trim(),
          position: orNull(p.position),
          email: orNull(p.email),
          phone: orNull(p.phone),
        };
        return a.externalPersonId ? { externalPersonId: a.externalPersonId, external } : { external };
      }),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ul className="mb-3 grid gap-2">
        {advisors.length === 0 && <li className="text-sm text-stone">ยังไม่ได้ระบุที่ปรึกษา</li>}
        {advisors.map((advisor, index) => {
          const stored = savedByKey.get(advisor.key);
          return (
            <li key={advisor.key} className="rounded-xl border border-ink/[0.10] bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {index + 1}.{' '}
                    {advisor.kind === 'internal'
                      ? advisor.label
                      : `${advisor.person.prefixTh ?? ''}${advisor.person.firstNameTh} ${advisor.person.lastNameTh}`}
                    <Badge tone={advisor.kind === 'external' ? 'kin' : 'matcha'}>
                      {advisor.kind === 'external' ? 'บุคคลภายนอก' : 'บุคลากร มมส.'}
                    </Badge>
                  </p>
                  {advisor.kind === 'internal' && (
                    <p className="mt-0.5 text-xs text-mist">
                      {advisor.email}
                      {advisor.consent ? ` · ${advisor.consent}` : ''}
                      {!advisor.userId ? ' · ยังไม่เคยเข้าสู่ระบบ' : ''}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setAdvisors((prev) => prev.filter((a) => a.key !== advisor.key))} className="shrink-0 text-beni underline">
                  ลบ
                </button>
              </div>

              {advisor.kind === 'external' && (
                <div className="mt-3 grid gap-3">
                  <ExternalPersonFields value={advisor.person} onChange={(person) => updatePerson(advisor.key, person)} />
                  {stored?.external ? (
                    <div className="rounded-lg bg-cream p-3">
                      {stored.consentFile ? (
                        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                          <Badge tone="matcha">แนบใบคำยินยอมแล้ว</Badge>
                          <FileLink fileId={stored.consentFile.id} label={stored.consentFile.originalName ?? 'ใบคำยินยอม'} />
                        </p>
                      ) : (
                        <p className="mb-2 text-sm text-kin">ยังไม่ได้แนบใบคำยินยอม (แบบฟอร์มคำยินยอมจากที่ปรึกษา ที่ลงนามแล้ว)</p>
                      )}
                      <ConsentUpload applicationId={application.id} sortOrder={stored.sortOrder} hasFile={Boolean(stored.consentFile)} />
                    </div>
                  ) : (
                    <p className="text-xs text-kin">บันทึกรายชื่อที่ปรึกษาก่อน จึงแนบใบคำยินยอมได้</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canAdd && !newPerson && (
        <div className="grid gap-2">
          <UserPicker
            excludeIds={[
              application.applicant.id,
              ...advisors.flatMap((a) => (a.kind === 'internal' && a.userId ? [a.userId] : [])),
            ]}
            onSelect={(user) =>
              add({ kind: 'internal', key: `email:${user.email}`, label: user.name ?? user.email, email: user.email, userId: user.id })
            }
            placeholder="ค้นหาที่ปรึกษาที่เป็นบุคลากร จากชื่อหรืออีเมล"
          />
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="หรือพิมพ์อีเมล @msu.ac.th (บุคลากรที่ยังไม่เคยเข้าสู่ระบบ)"
              className="field"
            />
            <button
              type="button"
              onClick={() => {
                const value = email.trim().toLowerCase();
                if (!value.includes('@')) return;
                add({ kind: 'internal', key: `email:${value}`, label: value, email: value, userId: null });
                setEmail('');
              }}
              className="btn btn-secondary shrink-0"
            >
              เพิ่ม
            </button>
          </div>
          <button type="button" onClick={() => setNewPerson({ ...EMPTY_PERSON })} className="btn btn-secondary justify-self-start">
            + เพิ่มที่ปรึกษาที่เป็นบุคคลภายนอก
          </button>
        </div>
      )}

      {newPerson && (
        <div className="grid gap-3 rounded-xl border border-kin/25 bg-kin-50 p-3">
          <p className="text-sm font-medium text-kin">ที่ปรึกษาที่เป็นบุคคลภายนอก</p>
          <ExternalPersonFields value={newPerson} onChange={setNewPerson} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newPerson.firstNameTh.trim() || !newPerson.lastNameTh.trim() || !newPerson.organization.trim() || !(orNull(newPerson.email) || orNull(newPerson.phone))}
              onClick={() => {
                add({ kind: 'external', key: `new:${Date.now()}`, externalPersonId: null, person: newPerson });
                setNewPerson(null);
              }}
              className="btn btn-primary"
            >
              เพิ่มในรายชื่อ
            </button>
            <button type="button" onClick={() => setNewPerson(null)} className="btn btn-ghost">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-mist">ต้องมีที่ปรึกษาที่เป็นบุคลากรของมหาวิทยาลัยอย่างน้อย 1 คน (รวมไม่เกิน 2 คน)</p>
      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกที่ปรึกษา" />
    </form>
  );
}
