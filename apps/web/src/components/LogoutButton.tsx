'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { publicEnv } from '@/lib/public-env';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleLogout() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`${publicEnv.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      // ไปหน้า login แล้ว refresh ให้ Server Component โหลดข้อมูลใหม่ (ไม่ใช้ข้อมูลผู้ใช้เดิมที่ cache ไว้)
      router.replace('/login');
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {pending ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
      </button>
      {failed && <p className="text-xs text-red-700">ออกจากระบบไม่สำเร็จ กรุณาลองใหม่</p>}
    </div>
  );
}
