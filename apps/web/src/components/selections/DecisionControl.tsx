'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import { DECISION_LABELS, type SelectionDecision } from '@/lib/selection-types';

// บันทึกผลการตัดสินของผู้เข้าชิง 1 คน (ต้องมีเหตุผล) — เปลี่ยนได้จนกว่าจะปิดรอบ
export function DecisionControl({
  roundId,
  userId,
  decision,
  reason,
}: {
  roundId: string;
  userId: string;
  decision: SelectionDecision | null;
  reason: string | null;
}) {
  const { save, pending, error } = useSave();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<SelectionDecision>(decision ?? 'selected');
  const [text, setText] = useState(reason ?? '');

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-matcha-700 underline">
        {decision ? 'เปลี่ยนผล' : 'ตัดสิน'}
      </button>
    );
  }
  return (
    <div className="grid gap-2 rounded-xl border border-ink/[0.08] bg-cream p-2">
      <select value={value} onChange={(e) => setValue(e.target.value as SelectionDecision)} aria-label="ผลการตัดสิน" className="field !min-h-9 text-sm">
        {Object.entries(DECISION_LABELS).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="เหตุผล (จำเป็น)" aria-label="เหตุผล" className="field !min-h-9 text-sm" />
      {error && <p role="alert" className="text-xs text-beni">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={async () => {
            if (await save('POST', `/selection-rounds/${roundId}/decisions`, { userId, decision: value, reason: text.trim() })) setEditing(false);
          }}
          className="btn btn-primary !min-h-9 text-sm"
        >
          บันทึก
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost !min-h-9 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
