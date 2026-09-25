'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';

// แก้ร่างรายงานประจำปี: สรุปผลการดำเนินงาน + ปัญหา/อุปสรรค/ข้อเสนอแนะ
export function AnnualReportEditor({ reportId, summary, obstacles }: { reportId: string; summary: string | null; obstacles: string | null }) {
  const { save, pending, error, saved } = useSave();
  const [summaryText, setSummaryText] = useState(summary ?? '');
  const [obstaclesText, setObstaclesText] = useState(obstacles ?? '');

  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">สรุปผลการดำเนินงานตลอดปี *</span>
        <textarea value={summaryText} onChange={(e) => setSummaryText(e.target.value)} rows={6} maxLength={10000} className="field" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">ปัญหา อุปสรรค และข้อเสนอแนะ</span>
        <textarea value={obstaclesText} onChange={(e) => setObstaclesText(e.target.value)} rows={4} maxLength={5000} className="field" />
      </label>
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => save('PUT', `/annual-reports/${reportId}`, { summary: summaryText || null, obstacles: obstaclesText || null })}
          className="btn btn-primary"
        >
          {pending ? 'กำลังบันทึก...' : 'บันทึกร่าง'}
        </button>
        {saved && <span className="text-sm text-matcha-700">บันทึกแล้ว</span>}
      </div>
    </div>
  );
}
