'use client';

import { useState } from 'react';
import type { ApplicationDetail } from '@/lib/club-application-types';
import { SaveBar } from './SaveBar';
import { useSave } from './useSave';

interface Row {
  activityDate: string;
  activityTime: string;
  title: string;
  note: string;
}

const inputClass = 'field !min-h-10 !px-3 text-sm';
const emptyRow: Row = { activityDate: '', activityTime: '', title: '', note: '' };

// แผนงานกิจกรรมประจำปี (หน้า 15: วันที่, เวลา, กิจกรรม, หมายเหตุ)
export function ActivitiesEditor({ application }: { application: ApplicationDetail }) {
  const { save, pending, error, saved } = useSave();
  const [rows, setRows] = useState<Row[]>(
    application.activities.map((a) => ({
      activityDate: a.activityDate ?? '',
      activityTime: a.activityTime ?? '',
      title: a.title,
      note: a.note ?? '',
    })),
  );
  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PUT', `/club-applications/${application.id}/activities`, {
      activities: rows
        .filter((row) => row.title.trim())
        .map((row) => ({
          activityDate: row.activityDate || null,
          activityTime: row.activityTime,
          title: row.title,
          note: row.note,
        })),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ul className="grid gap-2">
        {rows.length === 0 && <li className="text-sm text-stone">ยังไม่มีกิจกรรม</li>}
        {rows.map((row, index) => (
          <li key={index} className="grid gap-2 rounded-xl border border-ink/[0.08] bg-white/70 p-2 sm:grid-cols-[9rem_8rem_1fr_1fr_auto]">
            <input type="date" value={row.activityDate} onChange={(e) => update(index, { activityDate: e.target.value })} aria-label="วันที่" className={inputClass} />
            <input value={row.activityTime} onChange={(e) => update(index, { activityTime: e.target.value })} placeholder="เวลา" aria-label="เวลา" maxLength={100} className={inputClass} />
            <input value={row.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="กิจกรรม" aria-label="กิจกรรม" maxLength={500} className={inputClass} />
            <input value={row.note} onChange={(e) => update(index, { note: e.target.value })} placeholder="หมายเหตุ" aria-label="หมายเหตุ" maxLength={1000} className={inputClass} />
            <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} className="text-sm text-beni underline">
              ลบ
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setRows((prev) => [...prev, { ...emptyRow }])} className="mt-2 text-sm text-matcha-700 underline">
        + เพิ่มกิจกรรม
      </button>
      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกแผนกิจกรรม" />
    </form>
  );
}
