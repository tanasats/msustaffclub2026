import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
import type { ActivityItem } from '@/lib/activity-types';
import { formatDate } from '@/lib/format';

// แถวกิจกรรม 1 รายการ (ลิงก์ไปหน้ารายละเอียด)
export function ActivityListItem({ item }: { item: ActivityItem }) {
  return (
    <li>
      <Link href={`/activities/${item.id}`} className="group flex items-start gap-3 rounded-xl border border-ink/[0.08] p-3 transition hover:border-matcha-300">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-matcha-50 text-matcha-700">
          <Icon name="calendar" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink group-hover:text-matcha-800">{item.title}</span>
          <span className="block text-xs text-stone">
            {[formatDate(item.heldOn), item.location, item.participantTotal !== null ? `ผู้เข้าร่วม ${item.participantTotal} คน` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <Icon name="arrowRight" className="mt-3 size-4 shrink-0 text-mist transition group-hover:text-matcha-700" />
      </Link>
    </li>
  );
}
