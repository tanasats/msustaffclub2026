import { redirect } from 'next/navigation';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ActivityDetail, PlannedActivity } from '@/lib/activity-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubMember } from '@/lib/club-types';
import { bangkokToday, fiscalYearOf } from '@/lib/thai-date';

// แก้ไขกิจกรรม (ผู้มีสิทธิ์ชมรม club_activity:manage — API ตรวจซ้ำ)
export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = await apiGetJson<ActivityDetail>(`/activities/${encodeURIComponent(id)}`);
  if (!activity.me.canManage) redirect(`/activities/${activity.id}`);
  const [plan, members] = await Promise.all([
    apiGetJson<{ items: PlannedActivity[] }>(`/clubs/${activity.clubId}/activity-plans?fiscalYear=${fiscalYearOf(new Date(activity.heldOn))}`),
    apiGetJson<{ items: ClubMember[] }>(`/clubs/${activity.clubId}/members?pageSize=100`),
  ]);
  return (
    <>
      <PageHeader eyebrow="Activity" title="แก้ไขกิจกรรม" description={activity.title} back={{ href: `/activities/${activity.id}`, label: activity.title }} />
      <Bento>
        <ActivityForm
          clubId={activity.clubId}
          activity={activity}
          plans={plan.items}
          members={members.items.map((m) => ({ userId: m.userId, name: m.name ?? m.email }))}
          today={bangkokToday()}
        />
      </Bento>
    </>
  );
}
