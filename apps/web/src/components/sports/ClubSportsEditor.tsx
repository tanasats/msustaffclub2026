'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { Sport } from '@/lib/sport-types';

// เลือกชนิดกีฬาของชมรม (ผู้มีสิทธิ์ชมรม club_sport:manage — API ตรวจซ้ำ)
export function ClubSportsEditor({ clubId, sports, selected }: { clubId: string; sports: Sport[]; selected: string[] }) {
  const { save, pending, error } = useSave();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary !min-h-10 text-sm">
        เลือกชนิดกีฬาของชมรม
      </button>
    );
  }
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="grid gap-3 rounded-xl border border-ink/[0.08] bg-cream p-3">
      <div className="grid gap-1 sm:grid-cols-3">
        {sports.map((sport) => (
          <label key={sport.id} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-white">
            <input type="checkbox" checked={picked.has(sport.id)} onChange={() => toggle(sport.id)} className="size-4 accent-matcha-700" />
            {sport.nameTh}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            if (await save('PUT', `/clubs/${clubId}/sports`, { sportIds: [...picked] })) setOpen(false);
          }}
          className="btn btn-primary !min-h-10 text-sm"
        >
          {pending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
