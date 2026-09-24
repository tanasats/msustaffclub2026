'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// บันทึกข้อมูลไป API แล้ว refresh หน้า (ให้ Server Component โหลดข้อมูลใหม่ รวมถึงรายการสิ่งที่ยังขาด)
export function useSave() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<boolean> {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await apiSend(method, path, body);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return false;
    }
    setSaved(true);
    router.refresh();
    return true;
  }

  return { save, pending, error, saved };
}
