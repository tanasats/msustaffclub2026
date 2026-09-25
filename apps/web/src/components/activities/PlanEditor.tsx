'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { PlannedActivity } from '@/lib/activity-types';
import { formatDate } from '@/lib/format';

interface PlanEditorProps {
  clubId: string;
  fiscalYear: number;
  items: PlannedActivity[];
  // ผู้มีสิทธิ์ชมรม club_activity:manage (เพื่อ UX เท่านั้น API ตรวจซ้ำ)
  canManage: boolean;
}

interface Draft {
  plannedDate: string;
  plannedTime: string;
  title: string;
  note: string;
}

const EMPTY: Draft = { plannedDate: '', plannedTime: '', title: '', note: '' };

function toBody(draft: Draft) {
  return {
    plannedDate: draft.plannedDate || null,
    plannedTime: draft.plannedTime || null,
    title: draft.title,
    note: draft.note || null,
  };
}

function DraftFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-6">
      <input
        type="date"
        value={draft.plannedDate}
        onChange={(e) => onChange({ ...draft, plannedDate: e.target.value })}
        aria-label="วันที่"
        className="field !min-h-10 text-sm sm:col-span-2"
      />
      <input
        value={draft.plannedTime}
        onChange={(e) => onChange({ ...draft, plannedTime: e.target.value })}
        maxLength={100}
        placeholder="เวลา เช่น 17.00 น."
        aria-label="เวลา"
        className="field !min-h-10 text-sm sm:col-span-1"
      />
      <input
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        maxLength={300}
        placeholder="ชื่อกิจกรรม *"
        aria-label="ชื่อกิจกรรม"
        className="field !min-h-10 text-sm sm:col-span-3"
      />
      <input
        value={draft.note}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        maxLength={2000}
        placeholder="หมายเหตุ"
        aria-label="หมายเหตุ"
        className="field !min-h-10 text-sm sm:col-span-6"
      />
    </div>
  );
}

function PlanRow({ clubId, item, canManage }: { clubId: string; item: PlannedActivity; canManage: boolean }) {
  const { save, pending, error } = useSave();
  const [editing, setEditing] = useState<Draft | null>(null);
  const path = `/clubs/${clubId}/activity-plans/${item.id}`;

  if (editing) {
    return (
      <li className="grid gap-2 rounded-xl border border-matcha-300 p-3">
        <DraftFields draft={editing} onChange={setEditing} />
        {error && <p role="alert" className="text-sm text-beni">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !editing.title.trim()}
            onClick={async () => (await save('PUT', path, toBody(editing))) && setEditing(null)}
            className="btn btn-primary !min-h-9 text-sm"
          >
            บันทึก
          </button>
          <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost !min-h-9 text-sm">
            ยกเลิก
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-ink/[0.08] p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{item.title}</p>
        <p className="text-xs text-stone">
          {[item.plannedDate ? formatDate(item.plannedDate) : 'ยังไม่กำหนดวัน', item.plannedTime].filter(Boolean).join(' · ')}
          {item.heldCount > 0 && <span className="text-matcha-700"> · จัดแล้ว {item.heldCount} ครั้ง</span>}
        </p>
        {item.note && <p className="mt-1 text-sm text-stone">{item.note}</p>}
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() =>
              setEditing({ plannedDate: item.plannedDate ?? '', plannedTime: item.plannedTime ?? '', title: item.title, note: item.note ?? '' })
            }
            className="text-matcha-700 underline"
          >
            แก้ไข
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => window.confirm(`ลบ “${item.title}” ออกจากแผน?`) && save('DELETE', path)}
            className="text-beni underline"
          >
            ลบ
          </button>
          {error && <span role="alert" className="text-beni">{error}</span>}
        </div>
      )}
    </li>
  );
}

// แผนกิจกรรมประจำปีงบประมาณ: ทุกคนดูได้ ผู้มีสิทธิ์เพิ่ม/แก้/ลบได้
export function PlanEditor({ clubId, fiscalYear, items, canManage }: PlanEditorProps) {
  const { save, pending, error } = useSave();
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <div className="grid gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-stone">ยังไม่มีแผนกิจกรรมของปีงบประมาณ {fiscalYear}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <PlanRow key={item.id} clubId={clubId} item={item} canManage={canManage} />
          ))}
        </ul>
      )}
      {canManage &&
        (draft ? (
          <div className="grid gap-2 rounded-xl border border-ink/[0.08] bg-cream p-3">
            <p className="text-sm font-medium">เพิ่มกิจกรรมในแผน ปีงบประมาณ {fiscalYear}</p>
            <DraftFields draft={draft} onChange={setDraft} />
            {error && <p role="alert" className="text-sm text-beni">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !draft.title.trim()}
                onClick={async () => {
                  if (await save('POST', `/clubs/${clubId}/activity-plans`, { fiscalYear, ...toBody(draft) })) setDraft(null);
                }}
                className="btn btn-primary !min-h-9 text-sm"
              >
                เพิ่ม
              </button>
              <button type="button" onClick={() => setDraft(null)} className="btn btn-ghost !min-h-9 text-sm">
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setDraft(EMPTY)} className="btn btn-secondary !min-h-10 text-sm">
              เพิ่มกิจกรรมในแผน
            </button>
          </div>
        ))}
    </div>
  );
}
