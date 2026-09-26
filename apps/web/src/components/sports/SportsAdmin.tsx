'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { Sport } from '@/lib/sport-types';

function SportRow({ sport }: { sport: Sport }) {
  const { save, pending, error } = useSave();
  const [name, setName] = useState(sport.nameTh);
  const changed = name.trim() !== sport.nameTh;
  return (
    <li className="grid gap-2 py-2 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
      <code className="text-xs text-stone">{sport.code}</code>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-label={`ชื่อ ${sport.code}`} className="field !min-h-10 text-sm" />
      <span className="flex flex-wrap items-center gap-2">
        {changed && (
          <button type="button" disabled={pending || !name.trim()} onClick={() => save('PUT', `/sports/${sport.id}`, { nameTh: name.trim(), isActive: sport.isActive })} className="btn btn-primary !min-h-9 text-sm">
            บันทึก
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => save('PUT', `/sports/${sport.id}`, { nameTh: sport.nameTh, isActive: !sport.isActive })}
          className={`btn !min-h-9 text-sm ${sport.isActive ? 'btn-ghost' : 'btn-secondary'}`}
        >
          {sport.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </button>
        {!sport.isActive && <span className="text-xs text-beni">ปิดใช้งาน</span>}
        {error && <span role="alert" className="text-xs text-beni">{error}</span>}
      </span>
    </li>
  );
}

// จัดการรายการชนิดกีฬา (permission sport:manage — API ตรวจซ้ำ)
export function SportsAdmin({ sports }: { sports: Sport[] }) {
  const { save, pending, error } = useSave();
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState('');
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-ink/[0.06]">
        {sports.map((sport) => (
          <SportRow key={sport.id} sport={sport} />
        ))}
      </ul>
      <div className="grid gap-2 rounded-xl border border-ink/[0.08] bg-cream p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          <span className="text-stone">รหัส (อังกฤษตัวเล็ก)</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} maxLength={50} placeholder="เช่น rugby" className="field !min-h-10 text-sm" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-stone">ชื่อชนิดกีฬา</span>
          <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={100} className="field !min-h-10 text-sm" />
        </label>
        <button
          type="button"
          disabled={pending || !/^[a-z][a-z0-9_]*$/.test(code) || !nameTh.trim()}
          onClick={async () => {
            if (await save('POST', '/sports', { code, nameTh: nameTh.trim() })) {
              setCode('');
              setNameTh('');
            }
          }}
          className="btn btn-primary !min-h-10 text-sm"
        >
          เพิ่มชนิดกีฬา
        </button>
        {error && <p role="alert" className="text-sm text-beni sm:col-span-3">{error}</p>}
      </div>
    </div>
  );
}
