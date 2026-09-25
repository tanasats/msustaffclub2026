import Link from 'next/link';
import { ActivityListItem } from '@/components/activities/ActivityListItem';
import { PlanEditor } from '@/components/activities/PlanEditor';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ActivityItem, PlannedActivity } from '@/lib/activity-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import { fiscalYearOf } from '@/lib/thai-date';

// แผนกิจกรรมและกิจกรรมที่จัดจริงของชมรม ตามปีงบประมาณ (ทุกคนที่ login ดูได้)
export default async function ClubActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ fiscalYear?: string }>;
}) {
  const { clubId } = await params;
  const current = fiscalYearOf();
  const requested = Number((await searchParams).fiscalYear);
  const fiscalYear = Number.isInteger(requested) && requested >= current - 5 && requested <= current + 1 ? requested : current;
  const id = encodeURIComponent(clubId);
  const [club, plan, activities] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: PlannedActivity[] }>(`/clubs/${id}/activity-plans?fiscalYear=${fiscalYear}`),
    apiGetJson<{ items: ActivityItem[] }>(`/clubs/${id}/activities?fiscalYear=${fiscalYear}`),
  ]);
  const canManage = club.me.permissions.includes('club_activity:manage') && club.status === 'active';
  const years = [current - 1, current, current + 1];

  return (
    <>
      <PageHeader
        eyebrow="Activities"
        title="แผนและกิจกรรม"
        description={`${club.nameTh} · ปีงบประมาณ ${fiscalYear}`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
        actions={
          <nav aria-label="ปีงบประมาณ" className="flex gap-1.5">
            {years.map((year) => (
              <Link
                key={year}
                href={`/clubs/${club.id}/activities?fiscalYear=${year}`}
                aria-current={year === fiscalYear ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                  year === fiscalYear ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.10] bg-white text-stone'
                }`}
              >
                {year}
              </Link>
            ))}
          </nav>
        }
      />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Bento>
          <BentoTitle className="mb-3">แผนกิจกรรม ({plan.items.length})</BentoTitle>
          <PlanEditor clubId={club.id} fiscalYear={fiscalYear} items={plan.items} canManage={canManage && fiscalYear >= current - 1} />
        </Bento>
        <Bento>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <BentoTitle>กิจกรรมที่จัดแล้ว ({activities.items.length})</BentoTitle>
            {canManage && (
              <Link href={`/clubs/${club.id}/activities/new`} className="btn btn-primary !min-h-10 text-sm">
                บันทึกกิจกรรม
              </Link>
            )}
          </div>
          {activities.items.length === 0 ? (
            <p className="text-sm text-stone">ยังไม่มีกิจกรรมที่บันทึกในปีงบประมาณนี้</p>
          ) : (
            <ul className="grid gap-2">
              {activities.items.map((item) => (
                <ActivityListItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Bento>
      </div>
    </>
  );
}
