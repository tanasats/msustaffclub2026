import Link from 'next/link';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { DecisionControl } from '@/components/selections/DecisionControl';
import { Badge } from '@/components/ui/Badge';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { DECISION_LABELS, KIND_LABELS, type RoundDetail } from '@/lib/selection-types';

const DECISION_TONES = { selected: 'matcha', reserve: 'sky', not_selected: 'neutral' } as const;

// ตารางจัดอันดับผู้เข้าชิง + การตัดสิน (permission sport_selection:manage — API ตอบ 403 → หน้าไม่มีสิทธิ์)
export default async function SelectionRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGetJson<RoundDetail>(`/selection-rounds/${encodeURIComponent(id)}`);
  const open = r.status === 'open';
  return (
    <>
      <PageHeader
        eyebrow="Selection"
        title={r.title}
        description={[KIND_LABELS[r.kind], r.sportName, r.eventName, `ข้อมูลปีงบประมาณ ${r.fiscalYear}`, r.slots ? `ต้องการ ${r.slots} คน` : null]
          .filter(Boolean)
          .join(' · ')}
        back={{ href: '/selections', label: 'การคัดเลือกนักกีฬา' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={open ? 'sky' : 'matcha'}>{open ? 'เปิดอยู่' : 'ประกาศผลแล้ว'}</Badge>
            {!open && (
              <Link href={`/selections/${r.id}/announcement`} className="btn btn-secondary !min-h-10 text-sm">
                ดูประกาศผล
              </Link>
            )}
          </div>
        }
      />
      {r.criteria && (
        <Bento tone="cream" className="mb-3 sm:mb-4">
          <p className="text-sm whitespace-pre-line">
            <span className="font-medium">เกณฑ์การพิจารณา: </span>
            {r.criteria}
          </p>
        </Bento>
      )}
      <Bento>
        <p className="mb-3 text-xs text-mist">
          เรียงตาม เหรียญทอง → เงิน → ทองแดง → อันดับดีที่สุด → จำนวนแข่ง → ผลงาน → การเข้าร่วม (ช่วยอ่านเท่านั้น ผู้คัดเลือกเป็นผู้ตัดสิน)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-xs text-stone">
              <tr className="border-b border-ink/[0.08]">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">ผู้เข้าชิง</th>
                <th className="py-2 pr-2 text-center">แข่ง</th>
                <th className="py-2 pr-2 text-center">ทอง / เงิน / ทองแดง</th>
                <th className="py-2 pr-2 text-center">อันดับดีสุด</th>
                {r.kind === 'representative' && <th className="py-2 pr-2">สถิติดีที่สุด</th>}
                <th className="py-2 pr-2 text-center">ผลงาน</th>
                <th className="py-2 pr-2 text-center">เข้าร่วม</th>
                <th className="py-2">ผลการตัดสิน</th>
              </tr>
            </thead>
            <tbody>
              {r.candidates.map((c, index) => (
                <tr key={c.userId} className="border-b border-ink/[0.06] align-top">
                  <td className="py-2 pr-2 text-stone tabular-nums">{index + 1}</td>
                  <td className="py-2 pr-2">
                    <span className="font-medium">{c.name ?? c.email}</span>
                    <span className="block text-xs text-mist">{c.clubs.join(', ') || '—'}</span>
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums">{c.competitionCount}</td>
                  <td className="py-2 pr-2 text-center tabular-nums">
                    {c.gold} / {c.silver} / {c.bronze}
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums">{c.bestRank ?? '—'}</td>
                  {r.kind === 'representative' && (
                    <td className="py-2 pr-2 text-xs">
                      {c.bestStats.map((s) => `${s.nameTh} ${s.best.toLocaleString('th-TH')}${s.unit ? ` ${s.unit}` : ''}`).join(' · ') || '—'}
                    </td>
                  )}
                  <td className="py-2 pr-2 text-center tabular-nums">{c.achievementCount}</td>
                  <td className="py-2 pr-2 text-center tabular-nums">{c.activityCount}</td>
                  <td className="py-2">
                    {c.decision && (
                      <span className="mb-1 block">
                        <Badge tone={DECISION_TONES[c.decision]}>{DECISION_LABELS[c.decision]}</Badge>
                        <span className="mt-0.5 block text-xs text-stone">{c.reason}</span>
                      </span>
                    )}
                    {open && <DecisionControl roundId={r.id} userId={c.userId} decision={c.decision} reason={c.reason} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.candidates.length === 0 && <p className="py-4 text-sm text-stone">ไม่มีผู้เข้าชิง</p>}
        {open && (
          <div className="mt-5 border-t border-ink/[0.06] pt-5">
            <p className="mb-2 text-sm text-stone">ปิดรอบแล้วแก้ผลไม่ได้ และประกาศรายชื่อผู้ได้รับคัดเลือก/สำรองให้ทุกคนเห็น</p>
            <ActionButton path={`/selection-rounds/${r.id}/close`} label="ปิดรอบและประกาศผล" />
          </div>
        )}
      </Bento>
    </>
  );
}
