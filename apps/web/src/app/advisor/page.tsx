import Link from 'next/link';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { ClubLogo } from '@/components/clubs/ClubLogo';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AdvisorWork } from '@/lib/advisor-types';
import { apiGetJson } from '@/lib/api-server';
import { formatDate, formatDateTime } from '@/lib/format';
import { thaiMonthLabel } from '@/lib/report-types';

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-medium text-ink">
      {title}
      {count !== undefined && <span className="text-sm font-normal text-stone">({count})</span>}
    </h2>
  );
}

// กล่องงานที่ปรึกษาชมรม (ต้อง login เท่านั้น — API คืนเฉพาะข้อมูลของผู้ใช้เอง)
export default async function AdvisorPage() {
  const { requests, reports, clubs } = await apiGetJson<AdvisorWork>('/me/advisor-work');
  const pending = requests.filter((r) => r.status === 'awaiting_consent' && r.myConsentStatus === 'pending');
  const history = requests.filter((r) => !pending.includes(r));
  const nothing = requests.length === 0 && reports.length === 0 && clubs.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="Advisor"
        title="งานที่ปรึกษาชมรม"
        description="คำขอที่เสนอชื่อคุณเป็นที่ปรึกษา รายงานที่รอคุณรับทราบ และชมรมที่คุณเป็นที่ปรึกษา"
      />

      {nothing ? (
        <EmptyState icon="leaf" title="ยังไม่มีงานที่ปรึกษา" description="เมื่อมีชมรมเสนอชื่อคุณเป็นที่ปรึกษา รายการจะแสดงที่นี่" />
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {pending.length > 0 && (
            <section>
              <SectionTitle title="คำขอที่รอคุณยินยอม" count={pending.length} />
              <p className="mb-3 text-sm text-stone">เปิดคำขอเพื่ออ่านรายละเอียดชมรม แล้วกดยินยอมหรือปฏิเสธการเป็นที่ปรึกษา</p>
              <ApplicationList items={pending} emptyMessage="" />
            </section>
          )}

          {clubs.length > 0 && (
            <section>
              <SectionTitle title="รายงานประจำเดือนที่รอคุณรับทราบ" count={reports.length} />
              {reports.length === 0 ? (
                <p className="rounded-bento border border-ink/[0.10] bg-white p-5 text-sm text-stone">ไม่มีรายงานค้าง — รับทราบครบแล้ว</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2.5">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/monthly-reports/${r.id}`}
                        className="bento group flex items-center gap-4 p-4 transition hover:border-matcha-300 hover:bg-white sm:p-5"
                      >
                        <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-matcha-50 text-matcha-700 sm:inline-flex">
                          <Icon name="calendar" className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">รายงานเดือน{thaiMonthLabel(r.reportMonth)}</span>
                          <span className="block text-sm text-stone">{r.clubName}</span>
                          <span className="mt-0.5 block text-xs text-mist">
                            ส่งเมื่อ {formatDateTime(r.submittedAt)}
                            {r.submittedByName ? ` · ${r.submittedByName}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-matcha-700">รับทราบ</span>
                        <Icon name="arrowRight" className="size-4 shrink-0 text-mist transition group-hover:translate-x-0.5 group-hover:text-matcha-700" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {clubs.length > 0 && (
            <section>
              <SectionTitle title="ชมรมที่คุณเป็นที่ปรึกษา" count={clubs.length} />
              <ul className="grid gap-3 sm:grid-cols-2">
                {clubs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.id}`} className="bento flex items-center gap-4 p-4 transition hover:border-matcha-300 hover:bg-white">
                      <ClubLogo path={`/clubs/${c.id}/logo`} fileId={c.logoFileId} name={c.nameTh} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{c.nameTh}</span>
                        <span className="mt-0.5 block text-xs text-mist">เป็นที่ปรึกษาตั้งแต่ {formatDate(c.startedOn)}</span>
                      </span>
                      {c.reportsToAcknowledge > 0 && <Badge tone="kin">รอรับทราบ {c.reportsToAcknowledge}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <SectionTitle title="คำขอที่เคยเสนอชื่อคุณ" count={history.length} />
              <ApplicationList items={history} emptyMessage="" />
            </section>
          )}
        </div>
      )}
    </>
  );
}
