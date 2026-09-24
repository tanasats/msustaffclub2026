import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { ApplicationListItem } from '@/lib/club-application-types';
import { CONSENT_LABELS } from '@/lib/club-application-types';
import { StatusBadge } from './StatusBadge';

interface ApplicationListProps {
  items: ApplicationListItem[];
  emptyMessage: string;
}

// รายการคำขอ (ใช้ร่วมกันในคำขอของฉัน / รอยินยอม / กล่องงาน)
export function ApplicationList({ items, emptyMessage }: ApplicationListProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">{emptyMessage}</p>
    );
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/club-applications/${item.id}`}
            className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.nameTh}</p>
              <p className="text-xs text-slate-500">
                ปีงบประมาณ {item.fiscalYear}
                {item.applicantName ? ` · ผู้ยื่น ${item.applicantName}` : ''} · ปรับปรุงล่าสุด {formatDateTime(item.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.myConsentStatus && (
                <span className="text-xs text-slate-600">การยินยอมของคุณ: {CONSENT_LABELS[item.myConsentStatus]}</span>
              )}
              <StatusBadge status={item.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
