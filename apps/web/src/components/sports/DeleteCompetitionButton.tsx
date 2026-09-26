'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// ลบการแข่งขัน (ยืนยันก่อน) แล้วกลับไปหน้าการแข่งขันของชมรม
export function DeleteCompetitionButton({ competitionId, clubId }: { competitionId: string; clubId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (!window.confirm('ลบการแข่งขันนี้พร้อมผลทั้งหมด?')) return;
    setPending(true);
    const result = await apiSend('DELETE', `/competitions/${competitionId}`);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ลบไม่สำเร็จ');
      return;
    }
    router.push(`/clubs/${clubId}/competitions`);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={remove} disabled={pending} className="btn btn-danger">
        {pending ? 'กำลังลบ...' : 'ลบการแข่งขัน'}
      </button>
      {error && <span role="alert" className="text-sm text-beni">{error}</span>}
    </span>
  );
}
