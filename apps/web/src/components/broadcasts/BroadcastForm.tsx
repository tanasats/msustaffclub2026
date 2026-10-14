'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiGetClient, apiSend } from '@/lib/api-client';
import { STAFF_AUDIENCE_LABELS, type OrgUnitOption, type StaffAudience } from '@/lib/broadcast-types';

const TITLE_MAX = 200;
const BODY_MAX = 3000;

/**
 * เขียนและส่งข้อความถึงผู้ใช้หลายคน — mode staff = ประกาศจากสโมสร (เลือกกลุ่มผู้รับ), club = ข้อความถึงสมาชิกชมรม
 * แสดงจำนวนผู้รับก่อนส่ง และให้ยืนยันอีกครั้ง (ส่งแล้วยกเลิกไม่ได้) — API ตรวจสิทธิ์และนับผู้รับซ้ำเสมอ
 */
export function BroadcastForm({ mode, clubId, orgUnits = [] }: { mode: 'staff' | 'club'; clubId?: string; orgUnits?: OrgUnitOption[] }) {
  const router = useRouter();
  const [audience, setAudience] = useState<StaffAudience>('all_staff');
  const [orgUnitIds, setOrgUnitIds] = useState<string[]>([]);
  const [orgUnitQuery, setOrgUnitQuery] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  // นับผู้รับใหม่ทุกครั้งที่เปลี่ยนกลุ่ม/หน่วยงาน
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCount(null);
      setCountError(null);
      if (mode === 'club') {
        const data = await apiGetClient<{ count: number }>(`/clubs/${clubId}/messages/recipient-count`);
        if (cancelled) return;
        if (data) setCount(data.count);
        else setCountError('นับจำนวนผู้รับไม่สำเร็จ');
        return;
      }
      if (audience === 'org_units' && orgUnitIds.length === 0) return;
      const result = await apiSend('POST', '/staff-announcements/recipient-count', { audience, orgUnitIds });
      if (cancelled) return;
      if (result.ok) setCount((result.data as { count: number }).count);
      else setCountError(result.errorMessage ?? 'นับจำนวนผู้รับไม่สำเร็จ');
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, clubId, audience, orgUnitIds]);

  const canSubmit = title.trim() !== '' && body.trim() !== '' && count !== null && count > 0 && !pending;

  async function send() {
    setPending(true);
    setError(null);
    const result =
      mode === 'club'
        ? await apiSend('POST', `/clubs/${clubId}/messages`, { title, body })
        : await apiSend('POST', '/staff-announcements', { audience, orgUnitIds: audience === 'org_units' ? orgUnitIds : [], title, body });
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ส่งไม่สำเร็จ');
      return;
    }
    setSent((result.data as { recipientCount: number }).recipientCount);
    setTitle('');
    setBody('');
    router.refresh();
  }

  const visibleOrgUnits = orgUnitQuery.trim() ? orgUnits.filter((unit) => unit.nameTh.includes(orgUnitQuery.trim())) : orgUnits;
  const toggleOrgUnit = (id: string) =>
    setOrgUnitIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) setConfirming(true);
      }}
      className="grid gap-4"
    >
      {mode === 'staff' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-ink">ส่งถึง</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(STAFF_AUDIENCE_LABELS) as StaffAudience[]).map((value) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm transition ${
                  audience === value ? 'border-matcha-700 bg-matcha-50 text-matcha-900' : 'border-ink/[0.12] bg-white text-ink'
                }`}
              >
                <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} className="accent-matcha-700" />
                {STAFF_AUDIENCE_LABELS[value]}
              </label>
            ))}
          </div>
          {audience === 'org_units' && (
            <div className="mt-1 grid gap-2">
              <input
                type="search"
                value={orgUnitQuery}
                onChange={(e) => setOrgUnitQuery(e.target.value)}
                placeholder="ค้นหาหน่วยงาน"
                aria-label="ค้นหาหน่วยงาน"
                className="field"
              />
              {orgUnitIds.length > 0 && (
                <p className="text-sm text-ink">
                  เลือกแล้ว {orgUnitIds.length} หน่วยงาน: {orgUnits.filter((u) => orgUnitIds.includes(u.id)).map((u) => u.nameTh).join(', ')}
                </p>
              )}
              <div className="max-h-64 overflow-y-auto rounded-xl border border-ink/[0.12] bg-white p-2">
                {visibleOrgUnits.map((unit) => (
                  <label key={unit.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-cream">
                    <input type="checkbox" checked={orgUnitIds.includes(unit.id)} onChange={() => toggleOrgUnit(unit.id)} className="accent-matcha-700" />
                    {unit.nameTh}
                  </label>
                ))}
                {visibleOrgUnits.length === 0 && <p className="px-2 py-2 text-sm text-stone">ไม่พบหน่วยงาน</p>}
              </div>
            </div>
          )}
        </fieldset>
      )}

      <label className="grid gap-1 text-sm">
        หัวข้อ *
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={TITLE_MAX} className="field" />
      </label>
      <label className="grid gap-1 text-sm">
        ข้อความ *
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={BODY_MAX} rows={6} className="field" />
        <span className="text-xs text-stone">
          {body.length.toLocaleString('th-TH')} / {BODY_MAX.toLocaleString('th-TH')} ตัวอักษร
        </span>
      </label>

      <p className="text-sm text-stone" aria-live="polite">
        {countError ? (
          <span className="text-beni">{countError}</span>
        ) : mode === 'staff' && audience === 'org_units' && orgUnitIds.length === 0 ? (
          'เลือกหน่วยงานอย่างน้อย 1 หน่วยงาน'
        ) : count === null ? (
          'กำลังนับจำนวนผู้รับ...'
        ) : (
          <>
            ผู้รับ <span className="font-semibold text-ink">{count.toLocaleString('th-TH')} คน</span> — แสดงที่กระดิ่งในระบบทุกคน
            และส่งอีเมลถึงผู้ที่เปิดรับอีเมลแจ้งเตือน
          </>
        )}
      </p>

      {confirming ? (
        <div role="alertdialog" aria-label="ยืนยันการส่ง" className="rounded-xl border border-kin/30 bg-kin-50 p-4 text-sm text-kin">
          <p className="font-medium">ยืนยันส่ง &quot;{title}&quot; ถึง {count?.toLocaleString('th-TH')} คน? ส่งแล้วยกเลิกไม่ได้</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={send} disabled={pending} className="btn btn-primary">
              {pending ? 'กำลังส่ง...' : 'ยืนยันส่ง'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn btn-secondary">
              กลับไปแก้ไข
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!canSubmit} className="btn btn-primary">
            ส่งข้อความ
          </button>
          {sent !== null && <span className="text-sm text-matcha-700">ส่งแล้วถึง {sent.toLocaleString('th-TH')} คน</span>}
          {error && (
            <span role="alert" className="text-sm text-beni">
              {error}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
