import { redirect } from 'next/navigation';
import { AchievementForm } from '@/components/achievements/AchievementForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AchievementDetail } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { bangkokToday } from '@/lib/thai-date';

// แก้ไขผลงาน (เจ้าของ ขณะรอรับรอง/ถูกส่งกลับ) — API ตรวจสิทธิ์และสถานะซ้ำเสมอ
export default async function EditAchievementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const achievement = await apiGetJson<AchievementDetail>(`/achievements/${encodeURIComponent(id)}`);
  if (!achievement.me.canEdit) redirect(`/achievements/${achievement.id}`);
  return (
    <>
      <PageHeader
        eyebrow="Achievement"
        title="แก้ไขผลงาน"
        description={achievement.status === 'returned' ? 'แก้ไขตามที่กรรมการแนะนำ แล้วส่งให้รับรองอีกครั้ง' : achievement.clubName}
        back={{ href: `/achievements/${achievement.id}`, label: achievement.title }}
      />
      <Bento>
        <AchievementForm mode={{ kind: 'edit', achievement }} today={bangkokToday()} />
      </Bento>
    </>
  );
}
