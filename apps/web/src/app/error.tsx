'use client';

import { PageMessage } from '@/components/PageMessage';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageMessage title="เกิดข้อผิดพลาด" description="ไม่สามารถแสดงหน้านี้ได้ กรุณาลองใหม่อีกครั้ง">
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        ลองใหม่
      </button>
    </PageMessage>
  );
}
