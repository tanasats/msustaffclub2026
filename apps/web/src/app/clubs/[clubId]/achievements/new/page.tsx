import { AchievementForm } from '@/components/achievements/AchievementForm';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { CATEGORY_OPTIONS, LEVEL_OPTIONS, type AchievementCategory, type AchievementLevel } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import { bangkokToday } from '@/lib/thai-date';

// บันทึกผลงานของตัวเองในนามชมรม (สมาชิกเท่านั้น — ตรวจที่ API เสมอ ส่วนนี้เพื่อ UX)
// ค่าเริ่มต้นจาก query (ลิงก์ "สร้างเป็นผลงาน" จากผลการแข่งขัน) — เป็นเพียงค่าในฟอร์ม API ตรวจทุกช่องตอนบันทึก
const LEVELS = LEVEL_OPTIONS.map((o) => o.value) as readonly string[];
const CATEGORIES = CATEGORY_OPTIONS.map((o) => o.value) as readonly string[];

export default async function NewAchievementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clubId } = await params;
  const q = await searchParams;
  const prefill = {
    title: q.title?.slice(0, 300),
    achievedOn: q.achievedOn && /^\d{4}-\d{2}-\d{2}$/.test(q.achievedOn) ? q.achievedOn : undefined,
    level: q.level && LEVELS.includes(q.level) ? (q.level as AchievementLevel) : undefined,
    category: q.category && CATEGORIES.includes(q.category) ? (q.category as AchievementCategory) : undefined,
    award: q.award?.slice(0, 200) ?? null,
    organizer: q.organizer?.slice(0, 300) ?? null,
  };
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
          <AchievementForm mode={{ kind: 'create', clubId: club.id }} today={bangkokToday()} prefill={prefill} />
        ) : (
          <EmptyState icon="award" title="บันทึกผลงานได้เฉพาะสมาชิกของชมรม" description="สมัครเป็นสมาชิกจากหน้าชมรมก่อน" />
        )}
      </Bento>
    </>
  );
}
