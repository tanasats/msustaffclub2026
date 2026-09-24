'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex w-full flex-col gap-1 text-sm">
        ชื่อชมรมที่ขอจัดตั้ง
        <input
          value={nameTh}
          onChange={(e) => setNameTh(e.target.value)}
          required
          maxLength={200}
          placeholder="เช่น ชมรมดนตรีไทย"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !nameTh.trim()}
        className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? 'กำลังสร้าง...' : 'เริ่มยื่นคำขอ'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
