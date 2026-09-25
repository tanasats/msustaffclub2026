'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { publicEnv } from '@/lib/public-env';

// สร้างคำขอจัดตั้งชมรม (ฉบับร่าง) แล้วไปหน้ากรอกรายละเอียด
export function CreateApplicationForm() {
  const router = useRouter();
  const [nameTh, setNameTh] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${publicEnv.apiUrl}/club-applications`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameTh }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) {
        setError(data?.error?.message ?? 'สร้างคำขอไม่สำเร็จ');
        setPending(false);
        return;
      }
      router.push(`/club-applications/${data.id}`);
    } catch {
      setError('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่');
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <label className="grid gap-1.5 text-sm text-stone">
        ชื่อชมรมที่ขอจัดตั้ง
        <input
          value={nameTh}
          onChange={(e) => setNameTh(e.target.value)}
          required
          maxLength={200}
          placeholder="เช่น ชมรมดนตรีไทย"
          className="field"
        />
      </label>
      <button type="submit" disabled={pending || !nameTh.trim()} className="btn btn-primary">
        <Icon name="plus" className="size-[18px]" />
        {pending ? 'กำลังสร้าง...' : 'เริ่มยื่นคำขอ'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-beni">
          {error}
        </p>
      )}
    </form>
  );
}
