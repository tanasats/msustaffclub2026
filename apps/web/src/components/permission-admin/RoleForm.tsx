'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// สร้าง role ใหม่ (ไม่มี initial) หรือแก้ชื่อ/คำอธิบาย/สิทธิ์สูง — role ระบบเปลี่ยนสิทธิ์สูงไม่ได้ (API ตรวจซ้ำ)
export function RoleForm({
  initial,
}: {
  initial?: { code: string; nameTh: string; description: string | null; isPrivileged: boolean; isSystem: boolean };
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState(initial?.nameTh ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivileged, setIsPrivileged] = useState(initial?.isPrivileged ?? true);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const body = { nameTh, description, isPrivileged, reason };
    const result = initial
      ? await apiSend('PATCH', `/admin/roles/${initial.code}`, body)
      : await apiSend('POST', '/admin/roles', { code, ...body });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    setSaved(true);
    setReason('');
    if (!initial) {
      setCode('');
      setNameTh('');
      setDescription('');
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 text-sm">
      {!initial && (
        <label className="grid gap-1">
          รหัส role * <span className="text-xs text-stone">a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร เช่น club_board (แก้ภายหลังไม่ได้)</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={50} pattern="[a-z][a-z0-9_]{1,49}" className="field font-mono" />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          ชื่อ role *
          <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} required maxLength={100} className="field" />
        </label>
        <label className="grid gap-1">
          คำอธิบาย
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="field" />
        </label>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isPrivileged}
          disabled={initial?.isSystem}
          onChange={(e) => setIsPrivileged(e.target.checked)}
          className="mt-1 accent-matcha-700"
        />
        <span>
          role สิทธิ์สูง — ให้/ถอนแก่ผู้ใช้ได้เฉพาะผู้ดูแลระบบสูงสุด
          <span className="block text-xs text-stone">
            {initial?.isSystem ? 'role ระบบเปลี่ยนระดับนี้ไม่ได้' : 'ถ้าไม่ติ๊ก ผู้มีสิทธิ์ให้ role (user_role:assign) จะแจก role นี้ได้'}
          </span>
        </span>
      </label>
      <label className="grid gap-1">
        เหตุผล (บันทึกในประวัติ) *
        <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={1000} className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'กำลังบันทึก...' : initial ? 'บันทึกการแก้ไข' : 'สร้าง role'}
        </button>
        {saved && <span className="text-matcha-700">บันทึกแล้ว</span>}
        {error && (
          <span role="alert" className="text-beni">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
