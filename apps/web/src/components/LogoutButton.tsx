'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // ไปหน้า login แล้ว refresh ให้ Server Component โหลดข้อมูลใหม่ (ไม่ใช้ข้อมูลผู้ใช้เดิมที่ cache ไว้)
      router.replace('/login');
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handleLogout} disabled={pending} className={buttonClass('danger', 'w-full sm:w-auto')}>
        <Icon name="logout" className="size-[1.125rem]" />
        {pending ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
      </button>
      {failed && <p className="text-sm text-beni">ออกจากระบบไม่สำเร็จ กรุณาลองใหม่</p>}
    </div>
  );
}
