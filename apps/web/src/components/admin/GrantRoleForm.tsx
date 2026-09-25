'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

interface GrantRoleFormProps {
  userId: string;
  // role ที่ผู้ใช้ปัจจุบันให้ได้และผู้ใช้เป้าหมายยังไม่มี
  options: { code: string; nameTh: string; isPrivileged: boolean }[];
}

export function GrantRoleForm({ userId, options }: GrantRoleFormProps) {
  const router = useRouter();
  const [roleCode, setRoleCode] = useState(options[0]?.code ?? '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) {
    return <p className="text-sm text-stone">ไม่มี role ที่คุณให้เพิ่มได้</p>;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await apiSend('POST', `/admin/users/${userId}/roles`, { roleCode, reason });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ให้ role ไม่สำเร็จ');
      return;
    }
    setReason('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        role
        <select
          value={roleCode}
          onChange={(e) => setRoleCode(e.target.value)}
          className="field"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.nameTh} ({option.code}){option.isPrivileged ? ' — สิทธิ์สูง' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        เหตุผล (บันทึกในประวัติ)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          placeholder="เช่น แต่งตั้งตามคำสั่งที่ ..."
          className="field"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-beni">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !reason.trim()}
        className="self-start btn btn-primary"
      >
        {pending ? 'กำลังบันทึก...' : 'ให้ role'}
      </button>
    </form>
  );
}
