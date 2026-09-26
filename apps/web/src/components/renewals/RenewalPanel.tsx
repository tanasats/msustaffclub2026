'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/club-applications/StatusBadge';
import { apiSend } from '@/lib/api-client';
import type { ApplicationStatus } from '@/lib/club-application-types';
import { formatDate } from '@/lib/format';

export interface RenewalStatus {
  targetFiscalYear: number;
  opensOn: string;
  closesOn: string;
  registeredUntil: string;
  expired: boolean;
  isOpen: boolean;
  application: { id: string; status: ApplicationStatus } | null;
  canApply: boolean;
}

// สถานะการต่อทะเบียนในหน้าชมรม + ปุ่มยื่น (API ตรวจสิทธิ์/ช่วงเวลาซ้ำ)
export function RenewalPanel({ clubId, status }: { clubId: string; status: RenewalStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setPending(true);
    const result = await apiSend('POST', `/clubs/${clubId}/renewals`);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ยื่นต่อทะเบียนไม่สำเร็จ');
      return;
    }
    router.push(`/club-applications/${(result.data as { id: string }).id}`);
  }

  return (
    <div className="grid gap-2 text-sm">
      <p>
        ต่อทะเบียนปีงบประมาณ {status.targetFiscalYear}: ยื่นได้ {formatDate(status.opensOn)} – {formatDate(status.closesOn)}
      </p>
      {status.application ? (
        <Link href={`/club-applications/${status.application.id}`} className="inline-flex flex-wrap items-center gap-2 text-matcha-700 underline">
          <StatusBadge status={status.application.status} /> เปิดคำขอต่อทะเบียน
        </Link>
      ) : status.canApply ? (
        <div>
          <button type="button" onClick={apply} disabled={pending} className="btn btn-primary !min-h-10 text-sm">
            {pending ? 'กำลังสร้างคำขอ...' : `ยื่นต่อทะเบียนปีงบประมาณ ${status.targetFiscalYear}`}
          </button>
        </div>
      ) : (
        <p className="text-xs text-stone">
          {status.isOpen ? 'ประธานหรือเลขานุการชมรมเป็นผู้ยื่นต่อทะเบียน' : status.expired ? 'เลยช่วงยื่นต่อทะเบียนแล้ว กรุณาติดต่อสโมสร' : 'ยังไม่ถึงช่วงยื่นต่อทะเบียน'}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
    </div>
  );
}
