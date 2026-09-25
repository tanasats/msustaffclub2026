'use client';

import { useState } from 'react';
import type { ApplicationDetail } from '@/lib/club-application-types';
import { CONSENT_LABELS } from '@/lib/club-application-types';
import { SaveBar } from './SaveBar';
import { UserPicker } from './UserPicker';
import { useSave } from './useSave';

type AdvisorDraft = { key: string; label: string; email: string; userId: string | null; consent?: string };

const MAX_ADVISORS = 2;

// ที่ปรึกษา ≤ 2 คน: เลือกจากผู้ที่เคย login หรือพิมพ์อีเมล (ที่ปรึกษาต้อง login มายินยอมเองภายหลัง)
export function AdvisorsEditor({ application }: { application: ApplicationDetail }) {
  const { save, pending, error, saved } = useSave();
  const [advisors, setAdvisors] = useState<AdvisorDraft[]>(
    application.advisors.map((a) => ({
      key: a.email,
      label: a.user?.name ?? a.email,
      email: a.email,
      userId: a.user?.id ?? null,
      consent: CONSENT_LABELS[a.consentStatus],
    })),
  );
  const [email, setEmail] = useState('');

  const add = (draft: AdvisorDraft) => {
    if (advisors.length >= MAX_ADVISORS || advisors.some((a) => a.email === draft.email)) return;
    setAdvisors((prev) => [...prev, draft]);
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PUT', `/club-applications/${application.id}/advisors`, {
      advisors: advisors.map((a) => (a.userId ? { userId: a.userId } : { email: a.email })),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ul className="mb-3 grid gap-2">
        {advisors.length === 0 && <li className="text-sm text-stone">ยังไม่ได้ระบุที่ปรึกษา</li>}
        {advisors.map((advisor, index) => (
          <li key={advisor.key} className="flex items-center justify-between rounded-xl border border-ink/[0.08] bg-white/70 p-2 text-sm">
            <span>
              {index + 1}. {advisor.label}
              <span className="block text-xs text-mist">
                {advisor.email}
                {advisor.consent ? ` · ${advisor.consent}` : ''}
                {!advisor.userId ? ' · ยังไม่เคยเข้าสู่ระบบ' : ''}
              </span>
            </span>
            <button type="button" onClick={() => setAdvisors((prev) => prev.filter((a) => a.key !== advisor.key))} className="text-beni underline">
              ลบ
            </button>
          </li>
        ))}
      </ul>

      {advisors.length < MAX_ADVISORS && (
        <div className="grid gap-2">
          <UserPicker
            excludeIds={[application.applicant.id, ...advisors.flatMap((a) => (a.userId ? [a.userId] : []))]}
            onSelect={(user) => add({ key: user.email, label: user.name ?? user.email, email: user.email, userId: user.id })}
            placeholder="ค้นหาที่ปรึกษาจากชื่อหรืออีเมล"
          />
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="หรือพิมพ์อีเมล @msu.ac.th (กรณีที่ปรึกษายังไม่เคยเข้าสู่ระบบ)"
              className="w-full field"
            />
            <button
              type="button"
              onClick={() => {
                const value = email.trim().toLowerCase();
                if (!value.includes('@')) return;
                add({ key: value, label: value, email: value, userId: null });
                setEmail('');
              }}
              className="btn btn-secondary shrink-0"
            >
              เพิ่ม
            </button>
          </div>
        </div>
      )}
      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกที่ปรึกษา" />
    </form>
  );
}
