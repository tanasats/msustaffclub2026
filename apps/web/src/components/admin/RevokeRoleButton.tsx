'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

interface RevokeRoleButtonProps {
  userId: string;
  roleCode: string;
  roleName: string;
}

// ปุ่มถอน role: กดแล้วต้องกรอกเหตุผลก่อนยืนยัน
export function RevokeRoleButton({ userId, roleCode, roleName }: RevokeRoleButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await apiSend('POST', `/admin/users/${userId}/roles/${roleCode}/revoke`, { reason });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ถอน role ไม่สำเร็จ');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 underline">
        ถอน
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-80">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder={`เหตุผลที่ถอน ${roleName}`}
        aria-label={`เหตุผลที่ถอน ${roleName}`}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !reason.trim()}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? 'กำลังถอน...' : 'ยืนยันถอน'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-600 underline">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
