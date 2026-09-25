'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// สร้างร่างรายงานของเดือน แล้วไปหน้ารายงาน
export function CreateReportButton({ clubId, month }: { clubId: string; month: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    const result = await apiSend('POST', `/clubs/${clubId}/monthly-reports`, { month });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'สร้างรายงานไม่สำเร็จ');
      return;
    }
    router.push(`/monthly-reports/${(result.data as { id: string }).id}`);
  }

  return (
    <span className="grid gap-1">
      <button type="button" onClick={create} disabled={pending} className="btn btn-secondary !min-h-9 text-sm">
        {pending ? 'กำลังสร้าง...' : 'จัดทำรายงาน'}
      </button>
      {error && <span role="alert" className="text-xs text-beni">{error}</span>}
    </span>
  );
}
