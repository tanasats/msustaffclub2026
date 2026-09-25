import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/icons';
import { CATEGORY_LABELS, LEVEL_LABELS, type AchievementItem } from '@/lib/achievement-types';
import { formatDate } from '@/lib/format';
import { AchievementStatusBadge } from './AchievementStatusBadge';

interface AchievementListItemProps {
  item: AchievementItem;
  // แสดงชื่อเจ้าของ (หน้าชมรม/คิวรับรอง) หรือชื่อชมรม (ผลงานของฉัน)
  show: 'owner' | 'club';
  showStatus?: boolean;
}

// แถวผลงาน 1 รายการ (ลิงก์ไปหน้ารายละเอียด)
export function AchievementListItem({ item, show, showStatus = false }: AchievementListItemProps) {
  return (
    <li>
      <Link
        href={`/achievements/${item.id}`}
        className="group flex items-start gap-3 rounded-xl border border-ink/[0.08] p-3 transition hover:border-matcha-300"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-kin-50 text-kin">
          <Icon name="award" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {showStatus && <AchievementStatusBadge status={item.status} />}
            <Badge tone="neutral">ระดับ{LEVEL_LABELS[item.level]}</Badge>
            <Badge tone="neutral">{CATEGORY_LABELS[item.category]}</Badge>
          </span>
          <span className="mt-1 block font-medium text-ink group-hover:text-matcha-800">{item.title}</span>
          <span className="block text-xs text-stone">
            {[item.award, show === 'owner' ? (item.ownerName ?? item.ownerEmail) : item.clubName, formatDate(item.achievedOn)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <Icon name="arrowRight" className="mt-3 size-4 shrink-0 text-mist transition group-hover:text-matcha-700" />
      </Link>
    </li>
  );
}
