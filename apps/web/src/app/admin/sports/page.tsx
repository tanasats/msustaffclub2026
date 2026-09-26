import { redirect } from 'next/navigation';
import { SportsAdmin } from '@/components/sports/SportsAdmin';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { Sport } from '@/lib/sport-types';

// จัดการรายการชนิดกีฬา (permission sport:manage — ซ่อนเพื่อ UX, API ตรวจทุกการแก้ไข)
export default async function SportsAdminPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('sport:manage')) redirect('/forbidden');
  const { items } = await apiGetJson<{ items: Sport[] }>('/sports');
  return (
    <>
      <PageHeader eyebrow="Sports" title="ชนิดกีฬา" description="รายการชนิดกีฬาที่ชมรมกีฬาเลือกใช้ — ปิดใช้งานแทนการลบ เพราะมีชมรมและนักกีฬาอ้างอิงอยู่" />
      <Bento>
        <SportsAdmin sports={items} />
      </Bento>
    </>
  );
}
