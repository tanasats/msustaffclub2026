import Link from 'next/link';
import { AchievementStatusBadge } from '@/components/achievements/AchievementStatusBadge';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { FileLink } from '@/components/files/FileLink';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { ACTION_LABELS, CATEGORY_LABELS, LEVEL_LABELS, type AchievementDetail } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { formatDate, formatDateTime } from '@/lib/format';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-4 sm:gap-4">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="text-[0.9375rem] whitespace-pre-line sm:col-span-3">{value || '—'}</dd>
    </div>
  );
}

// รายละเอียดผลงาน: API ส่งไฟล์แนบ/ประวัติเฉพาะผู้มีสิทธิ์ และตอบ 404 ถ้าผลงานยังไม่รับรองและไม่มีสิทธิ์ดู
export default async function AchievementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await apiGetJson<AchievementDetail>(`/achievements/${encodeURIComponent(id)}`);
  const base = `/achievements/${a.id}`;
  const showDecisionNote = a.decisionNote && (a.status === 'returned' || a.status === 'rejected');

  return (
    <>
      <PageHeader
        eyebrow="Achievement"
        title={a.title}
        description={
          <>
            <Link href={`/clubs/${a.clubId}`} className="underline">
              {a.clubName}
            </Link>{' '}
            · {a.ownerName ?? a.ownerEmail}
          </>
        }
        back={a.me.isOwner ? { href: '/achievements', label: 'ผลงานของฉัน' } : { href: `/clubs/${a.clubId}`, label: a.clubName }}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <AchievementStatusBadge status={a.status} />
            <Badge tone="neutral">ระดับ{LEVEL_LABELS[a.level]}</Badge>
          </div>
        }
      />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          {showDecisionNote && (
            <div role="note" className="mb-4 rounded-xl border border-kin/30 bg-kin-50 p-3 text-sm">
              <p className="font-medium text-kin">{a.status === 'returned' ? 'กรรมการส่งกลับให้แก้ไข' : 'เหตุผลที่ไม่รับรอง'}</p>
              <p className="mt-1 whitespace-pre-line text-ink">{a.decisionNote}</p>
            </div>
          )}
          <dl className="divide-y divide-ink/[0.06]">
            <Row label="ผลที่ได้รับ" value={a.award} />
            <Row label="วันที่ได้รับ" value={formatDate(a.achievedOn)} />
            <Row label="ประเภท" value={CATEGORY_LABELS[a.category]} />
            <Row label="ผู้จัด / หน่วยงานที่มอบ" value={a.organizer} />
            <Row label="รายละเอียด" value={a.description} />
            {a.files && (
              <Row
                label="หลักฐาน"
                value={
                  a.files.length > 0 ? (
                    <span className="grid gap-1">
                      {a.files.map((file) => (
                        <FileLink key={file.fileId} fileId={file.fileId} label={file.originalName} />
                      ))}
                    </span>
                  ) : null
                }
              />
            )}
          </dl>

          {(a.me.canEdit || a.me.canReview) && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/[0.06] pt-5">
              {a.me.canEdit && (
                <>
                  <Link href={`${base}/edit`} className="btn btn-primary">
                    {a.status === 'returned' ? 'แก้ไขแล้วส่งใหม่' : 'แก้ไข'}
                  </Link>
                  <ActionButton path={`${base}/withdraw`} label="ถอนผลงาน" note="optional" tone="danger" />
                </>
              )}
              {a.me.canReview && (
                <>
                  <ActionButton path={`${base}/review`} body={{ decision: 'approve' }} label="รับรอง" />
                  <ActionButton path={`${base}/review`} body={{ decision: 'return' }} label="ส่งกลับแก้ไข" note="required" tone="neutral" />
                  <ActionButton path={`${base}/review`} body={{ decision: 'reject' }} label="ไม่รับรอง" note="required" tone="danger" />
                </>
              )}
            </div>
          )}
        </Bento>

        {a.events && (
          <Bento>
            <BentoTitle className="mb-3">ประวัติ</BentoTitle>
            <ol className="grid gap-3 border-l-2 border-ink/[0.08] pl-4">
              {a.events.map((event, index) => (
                <li key={index} className="text-sm">
                  <p className="font-medium">{ACTION_LABELS[event.action]}</p>
                  <p className="text-xs text-mist">
                    {formatDateTime(event.createdAt)} · {event.actorName ?? '—'}
                  </p>
                  {event.note && <p className="mt-1 whitespace-pre-line">{event.note}</p>}
                </li>
              ))}
            </ol>
          </Bento>
        )}
      </div>
    </>
  );
}
