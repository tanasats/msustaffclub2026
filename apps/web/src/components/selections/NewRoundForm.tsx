'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';
import type { SelectionKind } from '@/lib/selection-types';
import type { Sport } from '@/lib/sport-types';

// เปิดรอบคัดเลือก (permission sport_selection:manage — API ตรวจซ้ำ)
export function NewRoundForm({ sports, fiscalYears }: { sports: Sport[]; fiscalYears: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SelectionKind>('representative');
  const [title, setTitle] = useState('');
  const [sportId, setSportId] = useState(sports[0]?.id ?? '');
  const [eventName, setEventName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(fiscalYears[0]!);
  const [slots, setSlots] = useState('');
  const [criteria, setCriteria] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary !min-h-10 text-sm">
        เปิดรอบคัดเลือก
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await apiSend('POST', '/selection-rounds', {
      kind,
      title,
      sportId: kind === 'representative' ? sportId : null,
      eventName: kind === 'representative' && eventName ? eventName : null,
      fiscalYear,
      slots: slots ? Number(slots) : null,
      criteria: criteria || null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'เปิดรอบไม่สำเร็จ');
      return;
    }
    router.push(`/selections/${(result.data as { id: string }).id}`);
  }

  const field = 'field !min-h-10 text-sm';
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-ink/[0.08] bg-cream p-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        <span className="text-stone">ประเภท</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as SelectionKind)} className={field}>
          <option value="representative">คัดเลือกตัวแทน (ต่อชนิดกีฬา)</option>
          <option value="award">รางวัลเชิดชูเกียรติ (ทุกชนิดกีฬา + ผลงาน)</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-stone">ใช้ข้อมูลปีงบประมาณ</span>
        <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} className={field}>
          {fiscalYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="text-stone">ชื่อรอบ *</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} placeholder="เช่น คัดเลือกตัวแทนวิ่ง 10 กม. กีฬาบุคลากรแห่งประเทศไทย" className={field} />
      </label>
      {kind === 'representative' && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">ชนิดกีฬา *</span>
            <select value={sportId} onChange={(e) => setSportId(e.target.value)} className={field}>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameTh}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">ประเภท / รุ่น</span>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={200} className={field} />
          </label>
        </>
      )}
      <label className="grid gap-1 text-sm">
        <span className="text-stone">จำนวนที่ต้องการ (ถ้ามี)</span>
        <input type="number" min={1} value={slots} onChange={(e) => setSlots(e.target.value)} className={field} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="text-stone">เกณฑ์การพิจารณา</span>
        <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} maxLength={5000} className="field text-sm" />
      </label>
      {error && <p role="alert" className="text-sm text-beni sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary !min-h-10 text-sm">
          {pending ? 'กำลังเปิดรอบ...' : 'เปิดรอบ'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
