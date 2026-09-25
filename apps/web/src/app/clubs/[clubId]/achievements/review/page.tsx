import { AchievementListItem } from '@/components/achievements/AchievementListItem';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AchievementItem } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';

// คิวผลงานรอรับรองของชมรม (API ตอบ 403 ถ้าไม่มีสิทธิ์ชมรม club_achievement:manage → หน้าไม่มีสิทธิ์)
export default async function AchievementReviewPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [club, queue] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${encodeURIComponent(clubId)}`),
    apiGetJson<{ items: AchievementItem[] }>(`/clubs/${encodeURIComponent(clubId)}/achievement-reviews`),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Review"
        title="ผลงานรอรับรอง"
        description={`${club.nameTh} — เรียงจากที่ส่งก่อน (รับรองผลงานของตัวเองไม่ได้)`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
      />
      <Bento>
        {queue.items.length === 0 ? (
          <EmptyState icon="award" title="ไม่มีผลงานที่รอรับรอง" />
        ) : (
          <ul className="grid gap-2">
            {queue.items.map((item) => (
              <AchievementListItem key={item.id} item={item} show="owner" />
            ))}
          </ul>
        )}
      </Bento>
    </>
  );
}
