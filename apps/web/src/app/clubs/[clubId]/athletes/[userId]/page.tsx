import Link from 'next/link';
import { MedalBadge } from '@/components/sports/MedalBadge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { LEVEL_LABELS, type AchievementLevel } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { formatDate } from '@/lib/format';
import type { AthleteSummary } from '@/lib/sport-types';

// สรุปนักกีฬา (เจ้าตัว / ผู้ดูข้อมูลภายในชมรม — API ตอบ 404 ถ้าไม่มีสิทธิ์)
export default async function AthleteSummaryPage({ params }: { params: Promise<{ clubId: string; userId: string }> }) {
  const { clubId, userId } = await params;
  const a = await apiGetJson<AthleteSummary>(`/clubs/${encodeURIComponent(clubId)}/athletes/${encodeURIComponent(userId)}/summary`);
  const cards = [
    ['การแข่งขัน', a.summary.competitionCount, 'รายการ'],
    ['เหรียญทอง', a.summary.gold, 'เหรียญ'],
    ['เหรียญเงิน', a.summary.silver, 'เหรียญ'],
    ['เหรียญทองแดง', a.summary.bronze, 'เหรียญ'],
    ['เข้าร่วมกิจกรรม/ซ้อม', a.summary.activityCount, 'ครั้ง'],
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="Athlete"
        title={a.name ?? 'นักกีฬา'}
        description={a.registrations.map((r) => [r.sportName, r.eventOrPosition].filter(Boolean).join(' ')).join(' · ') || 'ไม่ได้ลงทะเบียนนักกีฬาแล้ว'}
        back={{ href: `/clubs/${clubId}/athletes`, label: 'นักกีฬาของชมรม' }}
      />
      <div className="grid gap-3 sm:gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {cards.map(([label, value, unit]) => (
            <Bento key={label} tone="cream">
              <BentoLabel>{label}</BentoLabel>
              <p className="mt-1 font-serif text-3xl font-medium tabular-nums">{value}</p>
              <p className="text-xs text-stone">{unit}</p>
            </Bento>
          ))}
        </div>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <Bento>
            <BentoTitle className="mb-3">สถิติดีที่สุด</BentoTitle>
            {a.bestStats.length === 0 ? (
              <p className="text-sm text-stone">ยังไม่มีค่าสถิติ</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {a.bestStats.map((s) => (
                  <li key={s.statId} className="flex justify-between gap-2 border-b border-ink/[0.06] pb-2">
                    <span>
                      {s.nameTh}
                      <span className="block text-xs text-mist">
                        {s.sportName} · {s.better === 'lower' ? 'ค่าน้อยดีกว่า' : 'ค่ามากดีกว่า'} · บันทึก {s.timesRecorded} ครั้ง
                      </span>
                    </span>
                    <span className="font-serif text-lg tabular-nums">
                      {s.best.toLocaleString('th-TH')} {s.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bento>
          <Bento className="lg:col-span-2">
            <BentoTitle className="mb-3">ประวัติการแข่งขัน</BentoTitle>
            {a.competitions.length === 0 ? (
              <p className="text-sm text-stone">ยังไม่มีการแข่งขัน</p>
            ) : (
              <ul className="divide-y divide-ink/[0.06]">
                {a.competitions.map((c) => (
                  <li key={c.competitionId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <Link href={`/competitions/${c.competitionId}`} className="font-medium underline-offset-2 hover:underline">
                        {c.title}
                      </Link>
                      <span className="block text-xs text-stone">
                        {[c.sportName, c.eventName, formatDate(c.heldFrom), `ระดับ${LEVEL_LABELS[c.level as AchievementLevel] ?? c.level}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.rank && <span className="text-stone">อันดับ {c.rank}</span>}
                      {c.medal && <MedalBadge medal={c.medal} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bento>
        </div>
      </div>
    </>
  );
}
