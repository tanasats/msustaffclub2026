import Link from 'next/link';
import { NewRoundForm } from '@/components/selections/NewRoundForm';
import { Badge } from '@/components/ui/Badge';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { KIND_LABELS, type RoundItem } from '@/lib/selection-types';
import type { Sport } from '@/lib/sport-types';
import { fiscalYearOf } from '@/lib/thai-date';

// รอบคัดเลือกทั้งหมด (permission sport_selection:manage — API ตอบ 403 → หน้าไม่มีสิทธิ์)
export default async function SelectionsPage() {
  const [rounds, sports] = await Promise.all([apiGetJson<{ items: RoundItem[] }>('/selection-rounds'), apiGetJson<{ items: Sport[] }>('/sports')]);
  const current = fiscalYearOf();
  return (
    <>
      <PageHeader
        eyebrow="Selection"
        title="การคัดเลือกนักกีฬา"
        description="ระบบเรียงข้อมูลผู้เข้าชิงจากผลการแข่งขัน สถิติ การเข้าร่วม และผลงาน — ผู้คัดเลือกเป็นผู้ตัดสินพร้อมเหตุผล"
        actions={<NewRoundForm sports={sports.items.filter((s) => s.isActive)} fiscalYears={[current, current - 1]} />}
      />
      <Bento>
        {rounds.items.length === 0 ? (
          <EmptyState icon="award" title="ยังไม่มีรอบคัดเลือก" />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {rounds.items.map((r) => (
              <li key={r.id}>
                <Link href={`/selections/${r.id}`} className="block rounded-xl border border-ink/[0.08] p-3 transition hover:border-matcha-300">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={r.status === 'open' ? 'sky' : 'matcha'}>{r.status === 'open' ? 'เปิดอยู่' : 'ประกาศผลแล้ว'}</Badge>
                    <Badge tone="neutral">{KIND_LABELS[r.kind]}</Badge>
                    {r.sportName && <Badge tone="kin">{r.sportName}</Badge>}
                  </span>
                  <span className="mt-1 block font-medium">{r.title}</span>
                  <span className="block text-xs text-stone">
                    ปีงบประมาณ {r.fiscalYear} · ตัดสินแล้ว {r.decidedCount} คน · คัดเลือก {r.selectedCount}
                    {r.slots ? `/${r.slots}` : ''} คน
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
