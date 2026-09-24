'use client';

import { PageMessage } from '@/components/PageMessage';

// retry() จะดึงข้อมูลจาก server ใหม่แล้ว render ซ้ำ (ต่างจาก reset() ที่แค่ render ซ้ำ)
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageMessage title="เกิดข้อผิดพลาด" description="ไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง">
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        ลองใหม่
      </button>
    </PageMessage>
  );
}
