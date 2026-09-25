import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Bento } from '@/components/ui/Bento';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDate } from '@/lib/format';
import { ANNUAL_STATUS_LABELS, type ReportOverviewItem } from '@/lib/report-types';
import { fiscalYearOf } from '@/lib/thai-date';

const STATUS_TONES = { draft: 'neutral', submitted: 'sky', acknowledged: 'matcha' } as const;

// ชื่อเดือนแบบย่อ เช่น "ม.ค. 69" จาก 'YYYY-MM'
function shortMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, mon - 1, 1)));
}

// ภาพรวมการส่งรายงานทุกชมรม (API ตอบ 403 ถ้าไม่มี permission club_report:review → หน้าไม่มีสิทธิ์)
export default async function ReportOverviewPage({ searchParams }: { searchParams: Promise<{ fiscalYear?: string }> }) {
  const current = fiscalYearOf();
  const requested = Number((await searchParams).fiscalYear);
  const fiscalYear = requested === current - 1 ? requested : current;
  const data = await apiGetJson<{ fiscalYear: number; annualDueDate: string; items: ReportOverviewItem[] }>(`/reports/overview?fiscalYear=${fiscalYear}`);
  const lagging = data.items.filter((i) => i.missingMonths.length > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Report Overview"
        title="ภาพรวมการส่งรายงาน"
        description={`ปีงบประมาณ ${fiscalYear} · ชมรมที่ค้างรายงานรายเดือน ${lagging} จาก ${data.items.length} ชมรม · รายงานประจำปีกำหนดส่ง ${formatDate(data.annualDueDate)}`}
        actions={
          <nav aria-label="ปีงบประมาณ" className="flex gap-1.5">
            {[current - 1, current].map((year) => (
              <Link
                key={year}
                href={`/reports/overview?fiscalYear=${year}`}
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
      <Bento>
        {data.items.length === 0 ? (
          <EmptyState icon="users" title="ยังไม่มีชมรมที่ดำเนินการอยู่" />
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {data.items.map((item) => (
              <li key={item.clubId} className="grid gap-2 py-3 md:grid-cols-[1fr_2fr_auto] md:items-center">
                <Link href={`/clubs/${item.clubId}`} className="font-medium underline-offset-2 hover:underline">
                  {item.clubName}
                </Link>
                <div className="flex flex-wrap gap-1">
                  {item.missingMonths.length === 0 ? (
                    <Badge tone="matcha">ส่งรายงานรายเดือนครบ</Badge>
                  ) : (
                    <>
                      <span className="text-xs text-beni">ค้าง {item.missingMonths.length} เดือน:</span>
                      {item.missingMonths.map((m) => (
                        <Badge key={m} tone="beni">
                          {shortMonth(m)}
                        </Badge>
                      ))}
                    </>
                  )}
                  {item.awaitingAdvisor > 0 && <Badge tone="sky">รอที่ปรึกษารับทราบ {item.awaitingAdvisor}</Badge>}
                </div>
                <div>
                  {item.annualReportId && item.annualStatus ? (
                    <Link href={`/annual-reports/${item.annualReportId}`}>
                      <Badge tone={STATUS_TONES[item.annualStatus]}>รายงานประจำปี: {ANNUAL_STATUS_LABELS[item.annualStatus]}</Badge>
                    </Link>
                  ) : (
                    <Badge tone="neutral">ยังไม่มีรายงานประจำปี</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Bento>
    </>
  );
}
