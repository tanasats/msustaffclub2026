import Link from 'next/link';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { ReportEditor } from '@/components/reports/ReportEditor';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDate, formatDateTime } from '@/lib/format';
import { REPORT_STATUS_LABELS, thaiMonthLabel, type MonthlyReportDetail } from '@/lib/report-types';

const STATUS_TONES = { draft: 'neutral', submitted: 'sky', acknowledged: 'matcha' } as const;

function monthEnd(start: string): string {
  const [year, month] = start.split('-').map(Number) as [number, number];
  return `${start.slice(0, 8)}${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

// รายงานรายเดือน: ร่าง (แก้/ส่ง) → รอที่ปรึกษารับทราบ → รับทราบแล้ว (API ตอบ 404 ถ้าไม่มีสิทธิ์ดู)
export default async function MonthlyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGetJson<MonthlyReportDetail>(`/monthly-reports/${encodeURIComponent(id)}`);
  const base = `/monthly-reports/${r.id}`;

  return (
    <>
      <PageHeader
        eyebrow="Monthly Report"
        title={`รายงานประจำเดือน${thaiMonthLabel(r.reportMonth)}`}
        description={r.clubName}
        back={{ href: `/clubs/${r.clubId}/reports?fiscalYear=${r.fiscalYear}`, label: 'รายงานรายเดือน' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[r.status]}>{REPORT_STATUS_LABELS[r.status]}</Badge>
            <Link href={`${base}/document`} className="btn btn-secondary !min-h-10 text-sm">
              เอกสารสำหรับพิมพ์
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          {r.me.canEdit ? (
            <>
              <ReportEditor reportId={r.id} summary={r.summary} meetings={r.meetings} monthStart={r.reportMonth} monthEnd={monthEnd(r.reportMonth)} />
              <div className="mt-5 border-t border-ink/[0.06] pt-5">
                <p className="mb-2 text-sm text-stone">ตรวจทานแล้วส่งให้ที่ปรึกษา — ส่งแล้วแก้ไขไม่ได้ และกิจกรรมจะถูกบันทึกตามข้อมูล ณ เวลาที่ส่ง</p>
                <ActionButton path={`${base}/submit`} label="ส่งรายงานให้ที่ปรึกษา" />
              </div>
            </>
          ) : (
            <>
              <BentoTitle className="mb-3">บันทึกการประชุม ({r.meetings.length})</BentoTitle>
              {r.meetings.length === 0 ? (
                <p className="text-sm text-stone">ไม่มีการประชุมในเดือนนี้</p>
              ) : (
                <ol className="grid gap-2">
                  {r.meetings.map((m) => (
                    <li key={m.id} className="rounded-xl border border-ink/[0.08] p-3 text-sm">
                      <p className="font-medium">{m.agenda}</p>
                      <p className="text-xs text-stone">
                        {formatDate(m.metOn)}
                        {m.attendeeCount !== null && ` · ผู้เข้าประชุม ${m.attendeeCount} คน`}
                      </p>
                      {m.resolution && <p className="mt-1 whitespace-pre-line">{m.resolution}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {r.summary && (
                <>
                  <BentoTitle className="mt-5 mb-2">สรุปอื่น ๆ</BentoTitle>
                  <p className="text-sm whitespace-pre-line">{r.summary}</p>
                </>
              )}
            </>
          )}
        </Bento>

        <div className="grid content-start gap-3 sm:gap-4">
          <Bento>
            <BentoTitle className="mb-3">กิจกรรมในเดือน ({r.activities.length})</BentoTitle>
            {r.status === 'draft' && <p className="mb-2 text-xs text-mist">ดึงจากกิจกรรมที่บันทึกไว้ในเดือนนี้ (ข้อมูลปัจจุบัน)</p>}
            {r.activities.length === 0 ? (
              <p className="text-sm text-stone">ไม่มีกิจกรรมที่บันทึกในเดือนนี้</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {r.activities.map((a) => (
                  <li key={a.id} className="border-b border-ink/[0.06] pb-2">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-stone">
                      {[formatDate(a.heldOn), a.location, a.participantTotal !== null ? `${a.participantTotal} คน` : null].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Bento>
          <Bento tone="cream">
            <BentoTitle className="mb-2">สถานะ</BentoTitle>
            <dl className="grid gap-1.5 text-sm">
              <div>
                <dt className="text-stone">จัดทำโดย</dt>
                <dd>{r.createdByName}</dd>
              </div>
              {r.submittedAt && (
                <div>
                  <dt className="text-stone">ส่งเมื่อ</dt>
                  <dd>
                    {formatDateTime(r.submittedAt)} · {r.submittedByName}
                  </dd>
                </div>
              )}
              {r.acknowledgedAt && (
                <div>
                  <dt className="text-stone">ที่ปรึกษารับทราบ</dt>
                  <dd>
                    {formatDateTime(r.acknowledgedAt)} · {r.acknowledgedByName}
                  </dd>
                  {r.acknowledgementNote && <dd className="mt-1 whitespace-pre-line">“{r.acknowledgementNote}”</dd>}
                </div>
              )}
            </dl>
            {r.me.canAcknowledge && (
              <div className="mt-4">
                <ActionButton path={`${base}/acknowledge`} label="รับทราบรายงาน" note="optional" />
              </div>
            )}
          </Bento>
        </div>
      </div>
    </>
  );
}
