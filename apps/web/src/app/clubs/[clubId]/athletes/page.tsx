import Link from 'next/link';
import { EndAthleteButton } from '@/components/sports/EndAthleteButton';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ClubPage } from '@/lib/club-types';
import { formatDate } from '@/lib/format';
import type { Athlete } from '@/lib/sport-types';

// รายชื่อนักกีฬาของชมรม แยกตามชนิดกีฬา (API ตอบ 403 ถ้าไม่ใช่สมาชิก/ผู้ดูข้อมูลภายใน → หน้าไม่มีสิทธิ์)
export default async function AthletesPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const id = encodeURIComponent(clubId);
  const [club, athletes, current] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: Athlete[] }>(`/clubs/${id}/athletes`),
    getCurrentUser(),
  ]);
  const canManage = club.me.permissions.includes('club_sport:manage');
  const bySport = new Map<string, Athlete[]>();
  for (const a of athletes.items) bySport.set(a.sportName, [...(bySport.get(a.sportName) ?? []), a]);

  return (
    <>
      <PageHeader eyebrow="Athletes" title="นักกีฬาของชมรม" description={club.nameTh} back={{ href: `/clubs/${club.id}`, label: club.nameTh }} />
      {athletes.items.length === 0 ? (
        <Bento>
          <EmptyState icon="users" title="ยังไม่มีนักกีฬา" description="สมาชิกลงทะเบียนเป็นนักกีฬาได้จากหน้าชมรม" />
        </Bento>
      ) : (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {[...bySport.entries()].map(([sportName, list]) => (
            <Bento key={sportName}>
              <BentoTitle className="mb-3">
                {sportName} ({list.length} คน)
              </BentoTitle>
              <ul className="divide-y divide-ink/[0.06]">
                {list.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <Link href={`/clubs/${club.id}/athletes/${a.userId}`} className="font-medium underline-offset-2 hover:underline">
                        {a.name ?? a.email}
                      </Link>
                      {a.eventOrPosition && <span className="text-stone"> · {a.eventOrPosition}</span>}
                      <span className="block text-xs text-mist">
                        {a.orgUnitName ?? '—'} · ตั้งแต่ {formatDate(a.since)}
                      </span>
                    </span>
                    {(canManage || a.userId === current?.user.id) && (
                      <EndAthleteButton athleteId={a.id} label={a.userId === current?.user.id ? 'เลิกเป็นนักกีฬา' : 'ให้พ้นจากนักกีฬา'} />
                    )}
                  </li>
                ))}
              </ul>
            </Bento>
          ))}
        </div>
      )}
    </>
  );
}
