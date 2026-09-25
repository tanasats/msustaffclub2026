'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';
import type { ReportMeeting } from '@/lib/report-types';

interface ReportEditorProps {
  reportId: string;
  summary: string | null;
  meetings: ReportMeeting[];
  // ช่วงวันที่ของเดือน (จำกัดวันที่ประชุม)
  monthStart: string;
  monthEnd: string;
}

interface Row {
  metOn: string;
  agenda: string;
  resolution: string;
  attendeeCount: string;
}

// แก้ร่างรายงาน: สรุปของเดือน + บันทึกการประชุม
export function ReportEditor({ reportId, summary, meetings, monthStart, monthEnd }: ReportEditorProps) {
  const { save, pending, error, saved } = useSave();
  const [text, setText] = useState(summary ?? '');
  const [rows, setRows] = useState<Row[]>(
    meetings.map((m) => ({ metOn: m.metOn, agenda: m.agenda, resolution: m.resolution ?? '', attendeeCount: m.attendeeCount?.toString() ?? '' })),
  );

  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  function submit() {
    return save('PUT', `/monthly-reports/${reportId}`, {
      summary: text || null,
      meetings: rows.map((r) => ({
        metOn: r.metOn,
        agenda: r.agenda,
        resolution: r.resolution || null,
        attendeeCount: r.attendeeCount ? Number(r.attendeeCount) : null,
      })),
    });
  }

  const incomplete = rows.some((r) => !r.metOn || !r.agenda.trim());

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm font-medium">บันทึกการประชุม ({rows.length})</p>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-ink/[0.08] p-3 sm:grid-cols-6">
            <input
              type="date"
              value={row.metOn}
              min={monthStart}
              max={monthEnd}
              onChange={(e) => update(index, { metOn: e.target.value })}
              aria-label="วันที่ประชุม"
              className="field !min-h-10 text-sm sm:col-span-2"
            />
            <input
              type="number"
              min={0}
              value={row.attendeeCount}
              onChange={(e) => update(index, { attendeeCount: e.target.value })}
              placeholder="ผู้เข้าประชุม (คน)"
              aria-label="จำนวนผู้เข้าประชุม"
              className="field !min-h-10 text-sm sm:col-span-2"
            />
            <button type="button" onClick={() => setRows((c) => c.filter((_, i) => i !== index))} className="text-left text-xs text-beni underline sm:col-span-2 sm:text-right">
              ลบการประชุมนี้
            </button>
            <input
              value={row.agenda}
              onChange={(e) => update(index, { agenda: e.target.value })}
              maxLength={2000}
              placeholder="วาระการประชุม *"
              aria-label="วาระการประชุม"
              className="field !min-h-10 text-sm sm:col-span-6"
            />
            <textarea
              value={row.resolution}
              onChange={(e) => update(index, { resolution: e.target.value })}
              rows={2}
              maxLength={5000}
              placeholder="สรุปมติ"
              aria-label="สรุปมติ"
              className="field text-sm sm:col-span-6"
            />
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setRows((c) => [...c, { metOn: monthStart, agenda: '', resolution: '', attendeeCount: '' }])}
            className="btn btn-secondary !min-h-10 text-sm"
          >
            เพิ่มการประชุม
          </button>
        </div>
      </div>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">สรุปอื่น ๆ ของเดือน</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={5000} className="field" />
      </label>
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={pending || incomplete} className="btn btn-primary">
          {pending ? 'กำลังบันทึก...' : 'บันทึกร่าง'}
        </button>
        {saved && <span className="text-sm text-matcha-700">บันทึกแล้ว</span>}
        {incomplete && <span className="text-xs text-stone">กรอกวันที่และวาระของทุกการประชุม</span>}
      </div>
    </div>
  );
}
