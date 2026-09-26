import Link from 'next/link';
import { DeleteCompetitionButton } from '@/components/sports/DeleteCompetitionButton';
import { MedalBadge } from '@/components/sports/MedalBadge';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { LEVEL_LABELS } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { MEDAL_LABELS, type CompetitionDetail } from '@/lib/sport-types';

// ลิงก์ "สร้างเป็นผลงาน" (ยืนยันแล้ว ข้อ 6): กรอกฟอร์มผลงานให้จากผลการแข่งขัน แล้วเข้าขั้นตอนรับรองปกติ
function achievementLink(c: CompetitionDetail, result: CompetitionDetail['results'][number]): string {
  const award = result.medal ? MEDAL_LABELS[result.medal] : `อันดับที่ ${result.rank}`;
  const params = new URLSearchParams({
    title: [c.title, c.eventName].filter(Boolean).join(' — '),
    achievedOn: c.heldTo ?? c.heldFrom,
    level: c.level,
    category: 'competition',
    award,
    ...(c.organizer ? { organizer: c.organizer } : {}),
  });
  return `/clubs/${c.clubId}/achievements/new?${params.toString()}`;
}

// รายละเอียดการแข่งขัน: อันดับ/เหรียญสาธารณะ ค่าสถิติ API ส่งมาเฉพาะของตัวเองหรือผู้ดูข้อมูลภายใน
export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, current] = await Promise.all([apiGetJson<CompetitionDetail>(`/competitions/${encodeURIComponent(id)}`), getCurrentUser()]);
  const dates = c.heldTo && c.heldTo !== c.heldFrom ? `${formatDate(c.heldFrom)} – ${formatDate(c.heldTo)}` : formatDate(c.heldFrom);

  return (
    <>
      <PageHeader
        eyebrow="Competition"
        title={c.title}
        description={[c.eventName, dates, c.location, c.organizer].filter(Boolean).join(' · ')}
        back={{ href: `/clubs/${c.clubId}/competitions`, label: 'การแข่งขัน' }}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="matcha">{c.sportName}</Badge>
            <Badge tone="neutral">ระดับ{LEVEL_LABELS[c.level]}</Badge>
            <Badge tone="neutral">{c.format === 'team' ? 'ทีม' : 'เดี่ยว'}</Badge>
          </div>
        }
      />
      <Bento>
        <BentoTitle className="mb-3">ผลการแข่งขัน ({c.results.length} คน)</BentoTitle>
        <ul className="divide-y divide-ink/[0.06]">
          {c.results.map((r) => {
            const isMe = r.userId === current?.user.id;
            return (
              <li key={r.userId} className="grid gap-1 py-3 sm:grid-cols-[4rem_1fr_auto] sm:items-center">
                <span className="font-serif text-2xl tabular-nums text-stone">{r.rank ?? '—'}</span>
                <span>
                  <Link href={`/clubs/${c.clubId}/athletes/${r.userId}`} className="font-medium underline-offset-2 hover:underline">
                    {r.name ?? r.email}
                  </Link>
                  {r.stats && r.stats.length > 0 && (
                    <span className="block text-xs text-stone">
                      {r.stats.map((s) => `${s.nameTh} ${s.value.toLocaleString('th-TH')}${s.unit ? ` ${s.unit}` : ''}`).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.medal && <MedalBadge medal={r.medal} />}
                  {isMe && (r.medal || r.rank) && (
                    <Link href={achievementLink(c, r)} className="text-xs text-matcha-700 underline">
                      สร้างเป็นผลงาน
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {c.note && <p className="mt-4 text-sm whitespace-pre-line text-stone">{c.note}</p>}
        {c.me.canManage && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/[0.06] pt-5">
            <Link href={`/competitions/${c.id}/edit`} className="btn btn-primary">
              แก้ไข
            </Link>
            <DeleteCompetitionButton competitionId={c.id} clubId={c.clubId} />
          </div>
        )}
      </Bento>
    </>
  );
}
