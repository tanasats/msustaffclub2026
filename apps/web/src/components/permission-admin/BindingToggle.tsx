'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

/**
 * สวิตช์ผูก/ถอนสิทธิ์ 1 รายการ — กดแล้วเปิดกล่องยืนยันพร้อมช่องเหตุผล (บังคับ) และคำเตือนผลกระทบ
 * API ตรวจสิทธิ์และกฎทั้งหมดซ้ำ (เช่น ห้ามแก้ super_admin, ห้ามเพิ่มสิทธิ์ที่ตนยังไม่มีให้ role ที่ตนถือ)
 */
export function BindingToggle({
  label,
  description,
  checked,
  grantPath,
  grantBody,
  revokePath,
  warning,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  grantPath: string;
  grantBody: Record<string, string>;
  revokePath: string;
  warning?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    const result = checked
      ? await apiSend('POST', revokePath, { reason })
      : await apiSend('POST', grantPath, { ...grantBody, reason });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.8125rem] break-all text-ink">{label}</p>
          <p className="text-sm text-stone">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${checked ? 'ถอน' : 'ผูก'}สิทธิ์ ${label}`}
          disabled={disabled || pending}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
          className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
            checked ? 'bg-matcha-700' : 'bg-ink/15'
          }`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {open && (
        <div role="alertdialog" aria-label="ยืนยันการแก้สิทธิ์" className="mt-2 grid gap-2 rounded-xl border border-kin/30 bg-kin-50 p-3 text-sm">
          <p className="font-medium text-kin">
            {checked ? 'ถอน' : 'ผูก'}สิทธิ์ {label} — มีผลทันที
          </p>
          {warning && <p className="text-kin">{warning}</p>}
          <label className="grid gap-1 text-ink">
            เหตุผล (บันทึกในประวัติ) *
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="field !min-h-10 bg-white" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={confirm} disabled={pending || reason.trim() === ''} className="btn btn-primary !min-h-10 text-sm">
              {pending ? 'กำลังบันทึก...' : checked ? 'ยืนยันถอนสิทธิ์' : 'ยืนยันผูกสิทธิ์'}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-secondary !min-h-10 text-sm">
              ยกเลิก
            </button>
            {error && (
              <span role="alert" className="text-beni">
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
