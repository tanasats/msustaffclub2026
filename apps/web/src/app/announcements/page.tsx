import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';
import { KIND_LABELS, type SelectionKind } from '@/lib/selection-types';

interface AnnouncementItem {
  id: string;
  kind: SelectionKind;
  title: string;
  sportName: string | null;
  eventName: string | null;
  fiscalYear: number;
  closedAt: string;
  selectedCount: number;
}

// รายการประกาศผลคัดเลือก (ต้อง login เท่านั้น)
export default async function AnnouncementsPage() {
  const { items } = await apiGetJson<{ items: AnnouncementItem[] }>('/selection-announcements');
  return (
    <>
      <PageHeader eyebrow="Announcements" title="ประกาศผลคัดเลือก" description="ผลการคัดเลือกตัวแทนนักกีฬาและรางวัลเชิดชูเกียรติ" />
      <Bento>
        {items.length === 0 ? (
          <EmptyState icon="award" title="ยังไม่มีประกาศผล" />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={`/selections/${a.id}/announcement`} className="block rounded-xl border border-ink/[0.08] p-3 transition hover:border-matcha-300">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{KIND_LABELS[a.kind]}</Badge>
                    {a.sportName && <Badge tone="kin">{a.sportName}</Badge>}
                  </span>
                  <span className="mt-1 block font-medium">{a.title}</span>
                  <span className="block text-xs text-stone">
                    ได้รับคัดเลือก {a.selectedCount} คน · ประกาศ {formatDateTime(a.closedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bento>
    </>
  );
}
