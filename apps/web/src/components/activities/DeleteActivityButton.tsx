'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// ลบกิจกรรม (ยืนยันก่อน) แล้วกลับไปหน้ากิจกรรมของชมรม
export function DeleteActivityButton({ activityId, clubId }: { activityId: string; clubId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm('ลบกิจกรรมนี้?')) return;
    setPending(true);
    const result = await apiSend('DELETE', `/activities/${activityId}`);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ลบไม่สำเร็จ');
      return;
    }
    router.push(`/clubs/${clubId}/activities`);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={remove} disabled={pending} className="btn btn-danger">
        {pending ? 'กำลังลบ...' : 'ลบกิจกรรม'}
      </button>
      {error && <span role="alert" className="text-sm text-beni">{error}</span>}
    </span>
  );
}
