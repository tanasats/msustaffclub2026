'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// สร้างร่างรายงานประจำปี แล้วไปหน้ารายงาน
export function CreateAnnualReportButton({ clubId, fiscalYear }: { clubId: string; fiscalYear: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    const result = await apiSend('POST', `/clubs/${clubId}/annual-reports`, { fiscalYear });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'สร้างรายงานไม่สำเร็จ');
      return;
    }
    router.push(`/annual-reports/${(result.data as { id: string }).id}`);
  }

  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={create} disabled={pending} className="btn btn-primary !min-h-10 text-sm">
        {pending ? 'กำลังสร้าง...' : `จัดทำรายงานประจำปี ${fiscalYear}`}
      </button>
      {error && <span role="alert" className="text-xs text-beni">{error}</span>}
    </span>
  );
}
