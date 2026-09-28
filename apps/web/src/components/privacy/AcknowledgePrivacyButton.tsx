'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// รับทราบประกาศเวอร์ชันที่แสดงอยู่ (API ปฏิเสธถ้าเวอร์ชันไม่ตรงกับปัจจุบัน)
export function AcknowledgePrivacyButton({ version }: { version: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setPending(true);
    setError(null);
    const result = await apiSend('POST', '/me/privacy/acknowledge', { version });
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={acknowledge} disabled={pending} className="btn btn-primary w-full sm:w-auto">
        {pending ? 'กำลังบันทึก...' : 'รับทราบประกาศความเป็นส่วนตัว'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-beni">
          {error}
        </p>
      )}
    </div>
  );
}
