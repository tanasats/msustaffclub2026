import Link from 'next/link';
import { CreateAnnualReportButton } from '@/components/reports/CreateAnnualReportButton';
import { CreateReportButton } from '@/components/reports/CreateReportButton';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import {
  ANNUAL_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  thaiMonthLabel,
  type AnnualReportSummary,
  type MonthlyReportSummary,
} from '@/lib/report-types';
import { bangkokToday, fiscalYearOf } from '@/lib/thai-date';

const STATUS_TONES = { draft: 'neutral', submitted: 'sky', acknowledged: 'matcha' } as const;

// 12 เดือนของปีงบประมาณ (ต.ค. ของปีก่อน – ก.ย.) ในรูป 'YYYY-MM'
function fiscalMonths(fiscalYear: number): string[] {
  const startYear = fiscalYear - 543 - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((9 + i) % 12) + 1;
    const year = startYear + (9 + i >= 12 ? 1 : 0);
    return `${year}-${String(month).padStart(2, '0')}`;
  });
}

// รายงานรายเดือนของชมรม (API ตอบ 403 ถ้าไม่มีสิทธิ์ชมรม club:view_internal → หน้าไม่มีสิทธิ์)
export default async function ClubReportsPage({
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
  const [club, reports, annual] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: MonthlyReportSummary[] }>(`/clubs/${id}/monthly-reports?fiscalYear=${fiscalYear}`),
    apiGetJson<{ items: AnnualReportSummary[] }>(`/clubs/${id}/annual-reports`),
  ]);
  const annualReport = annual.items.find((a) => a.fiscalYear === fiscalYear);
  const canSubmit = club.me.permissions.includes('club_report:submit') && club.status === 'active';
  const byMonth = new Map(reports.items.map((r) => [r.reportMonth.slice(0, 7), r]));
  const thisMonth = bangkokToday().slice(0, 7);
  const establishedMonth = club.establishedOn.slice(0, 7);

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="รายงานของชมรม"
        description={`${club.nameTh} · ปีงบประมาณ ${fiscalYear} — รายงานการประชุมและกิจกรรมให้ที่ปรึกษาทุกสิ้นเดือน (ระเบียบข้อ 16)`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
        actions={
          <nav aria-label="ปีงบประมาณ" className="flex gap-1.5">
            {[current - 1, current].map((year) => (
              <Link
                key={year}
                href={`/clubs/${club.id}/reports?fiscalYear=${year}`}
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
      <Bento tone="cream" className="mb-3 sm:mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <BentoTitle>รายงานประจำปีงบประมาณ {fiscalYear}</BentoTitle>
            <p className="text-sm text-stone">เสนอสโมสรก่อนสิ้นวาระ 30 วัน (ภายใน 31 ส.ค.)</p>
          </div>
          {annualReport ? (
            <Link href={`/annual-reports/${annualReport.id}`} className="inline-flex items-center gap-2 text-sm text-matcha-700 underline">
              <Badge tone={STATUS_TONES[annualReport.status]}>{ANNUAL_STATUS_LABELS[annualReport.status]}</Badge>
              เปิดรายงานประจำปี
            </Link>
          ) : canSubmit ? (
            <CreateAnnualReportButton clubId={club.id} fiscalYear={fiscalYear} />
          ) : (
            <Badge tone="neutral">ยังไม่มีรายงานประจำปี</Badge>
          )}
        </div>
      </Bento>
      <Bento>
        <BentoTitle className="mb-3">รายงานรายเดือน</BentoTitle>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {fiscalMonths(fiscalYear).map((month) => {
            const report = byMonth.get(month);
            const future = month > thisMonth;
            const beforeClub = month < establishedMonth;
            return (
              <li key={month} className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-ink/[0.08] p-3">
                <p className="font-medium">{thaiMonthLabel(`${month}-01`)}</p>
                {report ? (
                  <Link href={`/monthly-reports/${report.id}`} className="flex items-center justify-between gap-2 text-sm text-matcha-700 underline">
                    <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
                    เปิดรายงาน
                  </Link>
                ) : future || beforeClub ? (
                  <p className="text-xs text-mist">{future ? 'ยังไม่ถึงเดือนนี้' : 'ก่อนก่อตั้งชมรม'}</p>
                ) : canSubmit ? (
                  <CreateReportButton clubId={club.id} month={month} />
                ) : (
                  <p className="text-xs text-beni">ยังไม่มีรายงาน</p>
                )}
              </li>
            );
          })}
        </ul>
      </Bento>
    </>
  );
}
