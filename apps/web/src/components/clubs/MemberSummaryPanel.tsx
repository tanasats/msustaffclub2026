import { Bento, BentoTitle } from '@/components/ui/Bento';
import type { MemberSummary } from '@/lib/member-types';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// 'YYYY-MM' → 'ต.ค. 69'
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS[(m ?? 1) - 1]} ${String(((y ?? 0) + 543) % 100).padStart(2, '0')}`;
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-white p-3">
      <p className="text-xs text-stone">{label}</p>
      <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-ink">{value.toLocaleString('th-TH')}</p>
      {hint && <p className="text-xs text-stone">{hint}</p>}
    </div>
  );
}

/**
 * สรุปสมาชิกของชมรม: ตัวเลขหลัก (stat tile), สมาชิกตามหน่วยงาน (แท่งแนวนอนสีเดียว + ตัวเลขกำกับ),
 * เข้า/ออกรายเดือน (ตารางตัวเลข + แท่งสีเดียวของจำนวนที่เข้า) — ทุกค่ามีตัวเลขเป็นข้อความ ไม่สื่อด้วยสีอย่างเดียว
 */
export function MemberSummaryPanel({ summary }: { summary: MemberSummary }) {
  const { counts } = summary;
  const maxUnit = Math.max(1, ...summary.byOrgUnit.map((u) => u.count));
  const maxJoined = Math.max(1, ...summary.monthly.map((m) => m.joined));
  const unitTotal = summary.byOrgUnit.reduce((sum, u) => sum + u.count, 0);

  return (
    <div className="mb-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
      <Bento className="lg:col-span-3">
        <BentoTitle className="mb-3">สรุปสมาชิก (ปีงบประมาณ {summary.fiscalYear})</BentoTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="สมาชิกปัจจุบัน" value={counts.active} hint={`กรรมการ ${counts.committee} คน`} />
          <Stat label="สมาชิกใหม่ปีงบนี้" value={counts.joinedThisFiscalYear} hint={`30 วันล่าสุด ${counts.joinedLast30Days} คน`} />
          <Stat label="พ้นสภาพปีงบนี้" value={counts.endedThisFiscalYear} />
          <Stat
            label="รอดำเนินการ"
            value={counts.pendingApplications + counts.pendingInvitations + counts.pendingResignations}
            hint={`ใบสมัคร ${counts.pendingApplications} · คำเชิญ ${counts.pendingInvitations} · ลาออก ${counts.pendingResignations}`}
          />
        </div>
      </Bento>

      <Bento>
        <BentoTitle className="mb-3">สมาชิกตามหน่วยงาน</BentoTitle>
        {summary.byOrgUnit.length === 0 ? (
          <p className="text-sm text-stone">ยังไม่มีสมาชิก</p>
        ) : (
          <ul className="grid gap-2">
            {summary.byOrgUnit.map((u) => (
              <li key={u.orgUnitName ?? '-'} title={`${u.orgUnitName ?? 'ไม่ระบุหน่วยงาน'}: ${u.count} คน`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{u.orgUnitName ?? 'ไม่ระบุหน่วยงาน'}</span>
                  <span className="shrink-0 tabular-nums text-stone">{u.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-ink/[0.06]">
                  <div className="h-2 rounded-full bg-matcha-600" style={{ width: `${(u.count / maxUnit) * 100}%` }} />
                </div>
              </li>
            ))}
            {counts.active > unitTotal && <li className="text-xs text-stone">หน่วยงานอื่น ๆ {counts.active - unitTotal} คน</li>}
          </ul>
        )}
      </Bento>

      <Bento className="lg:col-span-2">
        <BentoTitle className="mb-3">สมาชิกเข้า–ออก 12 เดือนล่าสุด</BentoTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone">
                <th className="py-1 pr-3 font-normal">เดือน</th>
                <th className="py-1 pr-3 font-normal">เข้า</th>
                <th className="w-1/2 py-1 font-normal" aria-hidden="true" />
                <th className="py-1 pl-3 text-right font-normal">ออก</th>
              </tr>
            </thead>
            <tbody>
              {summary.monthly.map((m) => (
                <tr key={m.month} className="border-t border-ink/[0.06]" title={`${monthLabel(m.month)}: เข้า ${m.joined} ออก ${m.left}`}>
                  <td className="py-1 pr-3 whitespace-nowrap">{monthLabel(m.month)}</td>
                  <td className="py-1 pr-3 tabular-nums">{m.joined}</td>
                  <td className="py-1" aria-hidden="true">
                    {m.joined > 0 && <div className="h-2 rounded-full bg-matcha-600" style={{ width: `${(m.joined / maxJoined) * 100}%` }} />}
                  </td>
                  <td className="py-1 pl-3 text-right tabular-nums">{m.left}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bento>
    </div>
  );
}
