import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { RenewalContext } from '@/lib/club-application-types';
import { formatDate } from '@/lib/format';

// ข้อมูลประกอบคำขอต่อทะเบียน (อ่านอย่างเดียว): กรรมการ/สมาชิกปัจจุบัน และรายงานประจำปีของปีที่ผ่านมา
export function RenewalContextPanel({ context, clubId, fiscalYear }: { context: RenewalContext; clubId: string; fiscalYear: number }) {
  const annual = context.previousAnnualReport;
  const annualReady = annual && annual.status !== 'draft';
  const warnings = context.committee.filter((c) => c.termWarning);
  return (
    <div className="grid gap-4 text-sm">
      <p className="text-stone">
        คำขอต่อทะเบียนใช้กรรมการและสมาชิกปัจจุบันของชมรม — แก้ไขได้ที่
        <Link href={`/clubs/${clubId}`} className="mx-1 text-matcha-700 underline">
          หน้าชมรม
        </Link>
        (ทะเบียนปัจจุบันมีผลถึง {context.registeredUntil ? formatDate(context.registeredUntil) : '—'})
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge tone={context.activeMemberCount >= 5 ? 'matcha' : 'beni'}>สมาชิก {context.activeMemberCount} คน (ขั้นต่ำ 5)</Badge>
        <Badge tone={annualReady ? 'matcha' : 'beni'}>
          รายงานประจำปี {fiscalYear - 1}: {annualReady ? 'ส่งแล้ว' : annual ? 'ยังเป็นร่าง' : 'ยังไม่มี'}
        </Badge>
      </div>
      {warnings.length > 0 && (
        <p role="note" className="rounded-xl border border-kin/30 bg-kin-50 p-3 text-kin">
          มีกรรมการดำรงตำแหน่งครบ 4 ปีงบประมาณแล้ว ({warnings.map((w) => w.name).join(', ')}) — ระเบียบข้อ 8 กำหนดวาระสี่ปี
          พิจารณาเลือกตั้งกรรมการชุดใหม่ (ระบบไม่ตัดวาระอัตโนมัติ)
        </p>
      )}
      <ul className="divide-y divide-ink/[0.06]">
        {context.committee.map((c) => (
          <li key={c.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{c.positionTitle}</span>: {c.name}
              <span className="block text-xs text-mist">
                ตั้งแต่ {formatDate(c.startedOn)} · ปีงบประมาณที่ {c.fiscalYearsServed}
              </span>
            </span>
            {c.termWarning && <Badge tone="kin">ครบวาระ 4 ปี</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
