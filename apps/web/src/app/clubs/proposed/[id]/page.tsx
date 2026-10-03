import Link from 'next/link';
import { ClubLogo } from '@/components/clubs/ClubLogo';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { PROPOSED_STATUS_LABELS, type ProposedClubDetail } from '@/lib/club-types';
import { formatTimestampDate } from '@/lib/format';

// หน้าสรุปสาธารณะของชมรมที่อยู่ระหว่างขอจัดตั้ง (API ตอบ 404 ถ้าคำขอไม่ได้อยู่ในสถานะที่เปิดเผย)
export default async function ProposedClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await apiGetJson<ProposedClubDetail>(`/clubs/proposed/${encodeURIComponent(id)}`);

  return (
    <>
      <PageHeader
        eyebrow="Proposed Club"
        title={club.nameTh}
        back={{ href: '/clubs?view=proposed', label: 'ทำเนียบชมรม' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="kin">ระหว่างขอจัดตั้ง</Badge>
            {club.category && <Badge tone="matcha">{club.category.nameTh}</Badge>}
          </div>
        }
      />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <ClubLogo path={`/clubs/proposed/${club.id}/logo`} fileId={club.logoFileId} name={club.nameTh} size="lg" />
            <div className="min-w-0">
              {club.motto && <p className="font-serif text-lg text-ink">“{club.motto}”</p>}
              {club.logoMeaning && <p className="mt-2 text-sm text-stone">ความหมายของตรา: {club.logoMeaning}</p>}
              {club.category && club.categoryDetail && <p className="mt-2 text-sm text-stone">ประเภท: {club.categoryDetail}</p>}
            </div>
          </div>
          <BentoTitle className="mt-5 mb-2">วัตถุประสงค์</BentoTitle>
          {club.objectives.length === 0 ? (
            <p className="text-sm text-stone">—</p>
          ) : (
            <ol className="list-decimal pl-5 text-[0.9375rem]">
              {club.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          )}
        </Bento>

        <Bento tone="cream">
          <BentoTitle className="mb-3">สถานะคำขอ</BentoTitle>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-stone">ขั้นตอนปัจจุบัน</dt>
              <dd className="font-medium">{PROPOSED_STATUS_LABELS[club.status]}</dd>
            </div>
            {club.submittedAt && (
              <div>
                <dt className="text-stone">ยื่นต่อสโมสรเมื่อ</dt>
                <dd>{formatTimestampDate(club.submittedAt)}</dd>
              </div>
            )}
            <div>
              <dt className="text-stone">ปีงบประมาณ</dt>
              <dd>{club.fiscalYear}</dd>
            </div>
            <div>
              <dt className="text-stone">ประธานชมรม</dt>
              <dd>
                {club.presidentName ?? '—'}
                {club.presidentOrgUnit && <span className="block text-xs text-stone">{club.presidentOrgUnit}</span>}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-stone">เมื่อได้รับอนุมัติ ชมรมจะย้ายไปอยู่ในรายการชมรมที่ดำเนินการอยู่ และเปิดรับสมาชิกได้</p>
          {club.canViewApplication && (
            <Link href={`/club-applications/${club.id}`} className="btn btn-secondary mt-4 !min-h-10 text-sm">
              ดูคำขอฉบับเต็ม
            </Link>
          )}
        </Bento>
      </div>
    </>
  );
}
