import { notFound, redirect } from 'next/navigation';
import { StatDefinitionsAdmin } from '@/components/sports/StatDefinitionsAdmin';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { Sport, StatDefinition } from '@/lib/sport-types';

// ค่าสถิติของชนิดกีฬา (permission sport:manage — ซ่อนเพื่อ UX, API ตรวจทุกการแก้ไข)
export default async function SportStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('sport:manage')) redirect('/forbidden');
  const [sports, stats] = await Promise.all([
    apiGetJson<{ items: Sport[] }>('/sports'),
    apiGetJson<{ items: StatDefinition[] }>(`/sports/${encodeURIComponent(id)}/stats`),
  ]);
  const sport = sports.items.find((s) => s.id === id);
  if (!sport) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Sport Stats"
        title={`ค่าสถิติ: ${sport.nameTh}`}
        description="ค่าที่ชมรมบันทึกในผลการแข่งขันรายบุคคล เช่น ประตู, เวลา — ระบุว่าค่ามากหรือน้อยดีกว่า เพื่อหาสถิติดีที่สุด"
        back={{ href: '/admin/sports', label: 'ชนิดกีฬา' }}
      />
      <Bento>
        <StatDefinitionsAdmin sportId={sport.id} stats={stats.items} />
      </Bento>
    </>
  );
}
