import { ActionButton } from '@/components/club-applications/ActionButton';
import { AnnualReportEditor } from '@/components/reports/AnnualReportEditor';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDate, formatDateTime } from '@/lib/format';
import { ANNUAL_STATUS_LABELS, type AnnualReportDetail } from '@/lib/report-types';

const STATUS_TONES = { draft: 'neutral', submitted: 'sky', acknowledged: 'matcha' } as const;

// รายงานประจำปีเสนอสโมสร: ร่าง (แก้/ส่ง) → รอสโมสรรับทราบ → รับทราบแล้ว (API ตอบ 404 ถ้าไม่มีสิทธิ์ดู)
export default async function AnnualReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGetJson<AnnualReportDetail>(`/annual-reports/${encodeURIComponent(id)}`);
  const base = `/annual-reports/${r.id}`;
  const stats = [
    ['กิจกรรมที่จัด', r.stats.activityCount, `จากแผน ${r.stats.plannedCount} รายการ`],
    ['ผู้เข้าร่วมรวม', r.stats.participantTotal, 'คน-ครั้ง'],
    ['สมาชิก', r.stats.activeMembers, 'คน'],
    ['ผลงานที่รับรอง', r.stats.approvedAchievements, 'รายการ'],
    ['รายงานรายเดือนที่ส่ง', r.stats.monthlyReportsSubmitted, 'จาก 12 เดือน'],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Annual Report"
        title={`รายงานประจำปีงบประมาณ ${r.fiscalYear}`}
        description={`${r.clubName} · กำหนดส่งสโมสร ${formatDate(r.dueDate)} (ก่อนสิ้นวาระ 30 วัน)`}
        // เจ้าหน้าที่สโมสรไม่มีสิทธิ์ดูหน้ารายงานภายในของชมรม จึงย้อนกลับไปหน้าภาพรวมแทน
        back={
          r.me.canViewClubReports
            ? { href: `/clubs/${r.clubId}/reports?fiscalYear=${r.fiscalYear}`, label: 'รายงานของชมรม' }
            : { href: `/reports/overview?fiscalYear=${r.fiscalYear}`, label: 'ภาพรวมการส่งรายงาน' }
        }
        actions={<Badge tone={STATUS_TONES[r.status]}>{ANNUAL_STATUS_LABELS[r.status]}</Badge>}
      />
      <div className="grid gap-3 sm:gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {stats.map(([label, value, unit]) => (
            <Bento key={label} tone="cream">
              <BentoLabel>{label}</BentoLabel>
              <p className="mt-1 font-serif text-3xl font-medium tabular-nums">{value.toLocaleString('th-TH')}</p>
              <p className="text-xs text-stone">{unit}</p>
            </Bento>
          ))}
        </div>
        {r.status === 'draft' && <p className="text-xs text-mist">สถิติคำนวณจากข้อมูลปัจจุบัน และจะถูกบันทึกเป็นค่าคงที่เมื่อส่งรายงาน</p>}

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <Bento className="lg:col-span-2">
            {r.me.canEdit ? (
              <>
                <AnnualReportEditor reportId={r.id} summary={r.summary} obstacles={r.obstacles} />
                <div className="mt-5 border-t border-ink/[0.06] pt-5">
                  <p className="mb-2 text-sm text-stone">บันทึกร่างก่อน แล้วส่งให้สโมสร — ส่งแล้วแก้ไขไม่ได้</p>
                  <ActionButton path={`${base}/submit`} label="ส่งรายงานให้สโมสร" />
                </div>
              </>
            ) : (
              <>
                <BentoTitle className="mb-2">สรุปผลการดำเนินงาน</BentoTitle>
                <p className="text-sm whitespace-pre-line">{r.summary ?? '—'}</p>
                <BentoTitle className="mt-5 mb-2">ปัญหา อุปสรรค และข้อเสนอแนะ</BentoTitle>
                <p className="text-sm whitespace-pre-line">{r.obstacles ?? '—'}</p>
              </>
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
                  <dt className="text-stone">สโมสรรับทราบ</dt>
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

        <Bento>
          <BentoTitle className="mb-3">กิจกรรมตลอดปี ({r.activities.length})</BentoTitle>
          {r.activities.length === 0 ? (
            <p className="text-sm text-stone">ไม่มีกิจกรรมที่บันทึกในปีงบประมาณนี้</p>
          ) : (
            <ol className="grid gap-2 md:grid-cols-2">
              {r.activities.map((a) => (
                <li key={a.id} className="rounded-xl border border-ink/[0.08] p-3 text-sm">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-stone">
                    {[formatDate(a.heldOn), a.location, a.participantTotal !== null ? `${a.participantTotal} คน` : null].filter(Boolean).join(' · ')}
                  </p>
                  {a.summary && <p className="mt-1 text-stone">{a.summary}</p>}
                </li>
              ))}
            </ol>
          )}
        </Bento>
      </div>
    </>
  );
}
