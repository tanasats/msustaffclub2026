import { AchievementListItem } from '@/components/achievements/AchievementListItem';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AchievementPage } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';

// ผลงานของฉัน: ทุกสถานะ ทุกชมรม (ต้อง login เท่านั้น) ใช้ติดตามสถานะการรับรอง
export default async function MyAchievementsPage() {
  const { items, total } = await apiGetJson<AchievementPage>('/me/achievements?pageSize=100');
  return (
    <>
      <PageHeader
        eyebrow="Achievements"
        title="ผลงานของฉัน"
        description="ผลงานที่คุณบันทึกในนามชมรม และสถานะการรับรองจากกรรมการชมรม — บันทึกผลงานใหม่ได้จากหน้าชมรมที่คุณเป็นสมาชิก"
      />
      <Bento>
        {items.length === 0 ? (
          <EmptyState icon="award" title="ยังไม่มีผลงาน" description="เปิดหน้าชมรมที่คุณเป็นสมาชิก แล้วกด “บันทึกผลงาน”" />
        ) : (
          <>
            <p className="mb-3 text-sm text-stone">ทั้งหมด {total.toLocaleString('th-TH')} รายการ</p>
            <ul className="grid gap-2">
              {items.map((item) => (
                <AchievementListItem key={item.id} item={item} show="club" showStatus />
              ))}
            </ul>
          </>
        )}
      </Bento>
    </>
  );
}
