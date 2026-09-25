import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/format';
import type { ApplicationListItem } from '@/lib/club-application-types';
import { CONSENT_LABELS } from '@/lib/club-application-types';
import { StatusBadge } from './StatusBadge';

interface ApplicationListProps {
  items: ApplicationListItem[];
  emptyMessage: string;
}

// รายการคำขอแบบการ์ด (ใช้ร่วมกันในคำขอของฉัน / งานที่ปรึกษา / กล่องงาน)
export function ApplicationList({ items, emptyMessage }: ApplicationListProps) {
  if (items.length === 0) {
    return <EmptyState icon="scroll" title={emptyMessage} />;
  }
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/club-applications/${item.id}`}
            className="bento group flex items-center gap-4 p-4 transition hover:border-matcha-300 hover:bg-white sm:p-5"
          >
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-matcha-50 text-matcha-700 sm:inline-flex">
              <Icon name="scroll" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-[17px] font-medium text-ink">{item.nameTh}</span>
              <span className="mt-0.5 block text-xs text-mist">
                ปีงบประมาณ {item.fiscalYear}
                {item.applicantName ? ` · ${item.applicantName}` : ''} · {formatDateTime(item.updatedAt)}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                {item.myConsentStatus && (
                  <span className="text-xs text-stone">การยินยอมของคุณ: {CONSENT_LABELS[item.myConsentStatus]}</span>
                )}
              </span>
            </span>
            <Icon name="arrowRight" className="size-4 shrink-0 text-mist transition group-hover:translate-x-0.5 group-hover:text-matcha-700" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
