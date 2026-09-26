'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { ClubSport } from '@/lib/sport-types';

// สมาชิกลงทะเบียนเป็นนักกีฬาของชนิดกีฬาในชมรม พร้อมประเภท/ตำแหน่ง (ไม่บังคับ)
export function AthleteRegister({ clubId, sports }: { clubId: string; sports: ClubSport[] }) {
  const { save, pending, error } = useSave();
  const [sportId, setSportId] = useState(sports[0]?.sportId ?? '');
  const [eventOrPosition, setEventOrPosition] = useState('');

  if (sports.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
      <label className="grid gap-1 text-sm">
        <span className="text-stone">ชนิดกีฬา</span>
        <select value={sportId} onChange={(e) => setSportId(e.target.value)} className="field !min-h-10 text-sm">
          {sports.map((s) => (
            <option key={s.sportId} value={s.sportId}>
              {s.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-stone">ประเภท / ตำแหน่ง (ถ้ามี)</span>
        <input
          value={eventOrPosition}
          onChange={(e) => setEventOrPosition(e.target.value)}
          maxLength={200}
          placeholder="เช่น ผู้รักษาประตู, วิ่ง 10 กม., ประเภทคู่"
          className="field !min-h-10 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={pending || !sportId}
        onClick={async () => {
          if (await save('POST', `/clubs/${clubId}/athletes`, { sportId, eventOrPosition: eventOrPosition || null })) setEventOrPosition('');
        }}
        className="btn btn-primary !min-h-10 text-sm"
      >
        {pending ? 'กำลังบันทึก...' : 'ลงทะเบียนนักกีฬา'}
      </button>
      {error && <p role="alert" className="text-sm text-beni sm:col-span-3">{error}</p>}
    </div>
  );
}
