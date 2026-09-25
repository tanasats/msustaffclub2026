'use client';

import { PageMessage } from '@/components/PageMessage';
import { buttonClass } from '@/components/ui/button';

// retry() จะดึงข้อมูลจาก server ใหม่แล้ว render ซ้ำ (ต่างจาก reset() ที่แค่ render ซ้ำ)
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageMessage title="เกิดข้อผิดพลาด" description="ไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง">
      <button type="button" onClick={() => retry()} className={buttonClass('primary')}>
        ลองใหม่
      </button>
    </PageMessage>
  );
}
