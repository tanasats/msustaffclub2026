import { AchievementForm } from '@/components/achievements/AchievementForm';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import { bangkokToday } from '@/lib/thai-date';

// บันทึกผลงานของตัวเองในนามชมรม (สมาชิกเท่านั้น — ตรวจที่ API เสมอ ส่วนนี้เพื่อ UX)
export default async function NewAchievementPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await apiGetJson<ClubPage>(`/clubs/${encodeURIComponent(clubId)}`);
  const canSubmit = club.me.membershipStatus === 'active' && club.status === 'active';
  return (
    <>
      <PageHeader
        eyebrow="Achievement"
        title="บันทึกผลงาน"
        description={`ผลงานของคุณในนาม${club.nameTh} — กรรมการชมรมจะตรวจและรับรอง`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
      />
      <Bento>
        {canSubmit ? (
          <AchievementForm mode={{ kind: 'create', clubId: club.id }} today={bangkokToday()} />
        ) : (
          <EmptyState icon="award" title="บันทึกผลงานได้เฉพาะสมาชิกของชมรม" description="สมัครเป็นสมาชิกจากหน้าชมรมก่อน" />
        )}
      </Bento>
    </>
  );
}
