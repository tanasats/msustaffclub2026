import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { LEVEL_LABELS } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import { formatDate } from '@/lib/format';
import type { CompetitionItem } from '@/lib/sport-types';
import { fiscalYearOf } from '@/lib/thai-date';

// การแข่งขันของชมรมตามปีงบประมาณ (อันดับ/เหรียญเป็นข้อมูลสาธารณะ ทุกคนที่ login ดูได้)
export default async function CompetitionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ fiscalYear?: string }>;
}) {
  const { clubId } = await params;
  const current = fiscalYearOf();
  const requested = Number((await searchParams).fiscalYear);
  const fiscalYear = Number.isInteger(requested) && requested >= current - 5 && requested <= current ? requested : current;
  const id = encodeURIComponent(clubId);
  const [club, data] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: CompetitionItem[] }>(`/clubs/${id}/competitions?fiscalYear=${fiscalYear}`),
  ]);
  const canManage = club.me.permissions.includes('club_sport:manage') && club.status === 'active';
  const medals = data.items.reduce((sum, c) => ({ gold: sum.gold + c.gold, silver: sum.silver + c.silver, bronze: sum.bronze + c.bronze }), { gold: 0, silver: 0, bronze: 0 });

  return (
    <>
      <PageHeader
        eyebrow="Competitions"
        title="การแข่งขัน"
        description={`${club.nameTh} · ปีงบประมาณ ${fiscalYear} · ทอง ${medals.gold} เงิน ${medals.silver} ทองแดง ${medals.bronze}`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {[current - 1, current].map((year) => (
              <Link
                key={year}
                href={`/clubs/${club.id}/competitions?fiscalYear=${year}`}
                aria-current={year === fiscalYear ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                  year === fiscalYear ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.10] bg-white text-stone'
                }`}
              >
                {year}
              </Link>
            ))}
            {canManage && (
              <Link href={`/clubs/${club.id}/competitions/new`} className="btn btn-primary !min-h-10 text-sm">
                บันทึกการแข่งขัน
              </Link>
            )}
          </div>
        }
      />
      <Bento>
        {data.items.length === 0 ? (
          <EmptyState icon="award" title="ยังไม่มีการแข่งขันในปีงบประมาณนี้" />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {data.items.map((c) => (
              <li key={c.id}>
                <Link href={`/competitions/${c.id}`} className="block rounded-xl border border-ink/[0.08] p-3 transition hover:border-matcha-300">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone="matcha">{c.sportName}</Badge>
                    <Badge tone="neutral">ระดับ{LEVEL_LABELS[c.level]}</Badge>
                  </span>
                  <span className="mt-1 block font-medium">{c.title}</span>
                  <span className="block text-xs text-stone">
                    {[c.eventName, formatDate(c.heldFrom), `${c.participantCount} คน`].filter(Boolean).join(' · ')}
                    {c.gold + c.silver + c.bronze > 0 && ` · ทอง ${c.gold} เงิน ${c.silver} ทองแดง ${c.bronze}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bento>
    </>
  );
}
