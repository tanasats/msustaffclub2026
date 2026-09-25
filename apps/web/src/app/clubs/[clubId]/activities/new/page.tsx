import { redirect } from 'next/navigation';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import type { PlannedActivity } from '@/lib/activity-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubMember, ClubPage } from '@/lib/club-types';
import { bangkokToday, fiscalYearOf } from '@/lib/thai-date';

// บันทึกกิจกรรมที่จัดแล้ว (ผู้มีสิทธิ์ชมรม club_activity:manage — API ตรวจซ้ำ)
export default async function NewActivityPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await apiGetJson<ClubPage>(`/clubs/${encodeURIComponent(clubId)}`);
  if (!club.me.permissions.includes('club_activity:manage') || club.status !== 'active') redirect('/forbidden');
  const [plan, members] = await Promise.all([
    apiGetJson<{ items: PlannedActivity[] }>(`/clubs/${club.id}/activity-plans?fiscalYear=${fiscalYearOf()}`),
    apiGetJson<{ items: ClubMember[] }>(`/clubs/${club.id}/members?pageSize=100`),
  ]);
  return (
    <>
      <PageHeader eyebrow="Activity" title="บันทึกกิจกรรม" description={club.nameTh} back={{ href: `/clubs/${club.id}/activities`, label: 'แผนและกิจกรรม' }} />
      <Bento>
        <ActivityForm
          clubId={club.id}
          activity={null}
          plans={plan.items}
          members={members.items.map((m) => ({ userId: m.userId, name: m.name ?? m.email }))}
          today={bangkokToday()}
        />
      </Bento>
    </>
  );
}
