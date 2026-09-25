import Link from 'next/link';
import { DeleteActivityButton } from '@/components/activities/DeleteActivityButton';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ActivityDetail } from '@/lib/activity-types';
import { apiGetJson } from '@/lib/api-server';
import { formatDate } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-4 sm:gap-4">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="text-[0.9375rem] whitespace-pre-line sm:col-span-3">{value || '—'}</dd>
    </div>
  );
}

// รายละเอียดกิจกรรม: รายชื่อผู้เข้าร่วมและรูป API ส่งมาเฉพาะสมาชิกชมรม/ผู้ดูข้อมูลภายใน
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await apiGetJson<ActivityDetail>(`/activities/${encodeURIComponent(id)}`);
  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title={a.title}
        description={formatDate(a.heldOn)}
        back={{ href: `/clubs/${a.clubId}/activities`, label: 'แผนและกิจกรรม' }}
      />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          <dl className="divide-y divide-ink/[0.06]">
            <Row label="ตามแผน" value={a.plannedTitle} />
            <Row label="วันที่ / เวลา" value={[formatDate(a.heldOn), a.timeText].filter(Boolean).join(' · ')} />
            <Row label="สถานที่" value={a.location} />
            <Row label="สรุปผล" value={a.summary} />
            <Row label="ผู้เข้าร่วม" value={a.participantTotal !== null ? `${a.participantTotal} คน` : null} />
            <Row label="บันทึกโดย" value={a.recordedByName} />
          </dl>
          {a.photos && a.photos.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {a.photos.map((photo) => (
                <a
                  key={photo.fileId}
                  href={`${publicEnv.apiUrl}/files/${photo.fileId}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-ink/[0.08] bg-white"
                >
                  {/* รูปมาจาก API (ตรวจสิทธิ์แล้ว redirect ไป URL อายุสั้น) next/image ใช้ไม่ได้ */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${publicEnv.apiUrl}/files/${photo.fileId}/view`} alt={photo.originalName} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {a.me.canManage && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/[0.06] pt-5">
              <Link href={`/activities/${a.id}/edit`} className="btn btn-primary">
                แก้ไข
              </Link>
              <DeleteActivityButton activityId={a.id} clubId={a.clubId} />
            </div>
          )}
        </Bento>
        {a.participants && (
          <Bento>
            <BentoTitle className="mb-3">รายชื่อผู้เข้าร่วม ({a.participants.length})</BentoTitle>
            {a.participants.length === 0 ? (
              <p className="text-sm text-stone">ไม่ได้บันทึกรายชื่อ</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {a.participants.map((p) => (
                  <li key={p.userId}>{p.name ?? p.email}</li>
                ))}
              </ul>
            )}
          </Bento>
        )}
      </div>
    </>
  );
}
