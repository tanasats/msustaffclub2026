'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { StatDefinition } from '@/lib/sport-types';

function StatRow({ stat }: { stat: StatDefinition }) {
  const { save, pending, error } = useSave();
  const [nameTh, setNameTh] = useState(stat.nameTh);
  const [unit, setUnit] = useState(stat.unit ?? '');
  const [better, setBetter] = useState(stat.better);
  const changed = nameTh.trim() !== stat.nameTh || (unit || null) !== stat.unit || better !== stat.better;
  const body = (isActive: boolean) => ({ nameTh: nameTh.trim(), unit: unit.trim() || null, better, isActive });
  return (
    <li className="grid gap-2 py-2 sm:grid-cols-[8rem_1fr_7rem_10rem_auto] sm:items-center">
      <code className="text-xs text-stone">{stat.code}</code>
      <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={100} aria-label="ชื่อค่าสถิติ" className="field !min-h-10 text-sm" />
      <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="หน่วย" aria-label="หน่วย" className="field !min-h-10 text-sm" />
      <select value={better} onChange={(e) => setBetter(e.target.value as 'higher' | 'lower')} aria-label="ค่าที่ดีกว่า" className="field !min-h-10 text-sm">
        <option value="higher">ค่ามากดีกว่า</option>
        <option value="lower">ค่าน้อยดีกว่า</option>
      </select>
      <span className="flex flex-wrap items-center gap-2">
        {changed && (
          <button type="button" disabled={pending || !nameTh.trim()} onClick={() => save('PUT', `/sport-stats/${stat.id}`, body(stat.isActive))} className="btn btn-primary !min-h-9 text-sm">
            บันทึก
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => save('PUT', `/sport-stats/${stat.id}`, body(!stat.isActive))} className="btn btn-ghost !min-h-9 text-sm">
          {stat.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </button>
        {error && <span role="alert" className="text-xs text-beni">{error}</span>}
      </span>
    </li>
  );
}

// ค่าสถิติของชนิดกีฬา (permission sport:manage — API ตรวจซ้ำ)
export function StatDefinitionsAdmin({ sportId, stats }: { sportId: string; stats: StatDefinition[] }) {
  const { save, pending, error } = useSave();
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [unit, setUnit] = useState('');
  const [better, setBetter] = useState<'higher' | 'lower'>('higher');
  return (
    <div className="grid gap-4">
      {stats.length === 0 ? (
        <p className="text-sm text-stone">ยังไม่มีค่าสถิติ</p>
      ) : (
        <ul className="divide-y divide-ink/[0.06]">
          {stats.map((s) => (
            <StatRow key={s.id} stat={s} />
          ))}
        </ul>
      )}
      <div className="grid gap-2 rounded-xl border border-ink/[0.08] bg-cream p-3 sm:grid-cols-[8rem_1fr_7rem_10rem_auto] sm:items-end">
        <input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} maxLength={50} placeholder="รหัส เช่น goals" aria-label="รหัส" className="field !min-h-10 text-sm" />
        <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={100} placeholder="ชื่อ เช่น ประตู" aria-label="ชื่อ" className="field !min-h-10 text-sm" />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="หน่วย" aria-label="หน่วย" className="field !min-h-10 text-sm" />
        <select value={better} onChange={(e) => setBetter(e.target.value as 'higher' | 'lower')} aria-label="ค่าที่ดีกว่า" className="field !min-h-10 text-sm">
          <option value="higher">ค่ามากดีกว่า</option>
          <option value="lower">ค่าน้อยดีกว่า</option>
        </select>
        <button
          type="button"
          disabled={pending || !/^[a-z][a-z0-9_]*$/.test(code) || !nameTh.trim()}
          onClick={async () => {
            if (await save('POST', `/sports/${sportId}/stats`, { code, nameTh: nameTh.trim(), unit: unit.trim() || null, better })) {
              setCode('');
              setNameTh('');
              setUnit('');
            }
          }}
          className="btn btn-primary !min-h-10 text-sm"
        >
          เพิ่ม
        </button>
        {error && <p role="alert" className="text-sm text-beni sm:col-span-5">{error}</p>}
      </div>
    </div>
  );
}
