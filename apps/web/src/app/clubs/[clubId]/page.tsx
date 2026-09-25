import { redirect } from 'next/navigation';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { MembershipPanel } from '@/components/clubs/MembershipPanel';
import { RemoveMemberButton } from '@/components/clubs/RemoveMemberButton';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ClubMember, ClubPage, MembershipRequest } from '@/lib/club-types';
import { formatDate, formatDateTime } from '@/lib/format';

const STATUS_LABEL = { active: null, suspended: 'ถูกระงับชั่วคราว', dissolved: 'ยุบแล้ว' } as const;

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-2.5">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] text-ink">{value || '—'}</dd>
    </div>
  );
}

export default async function ClubDetailPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  // API ตอบ 404 ถ้าไม่พบชมรม และส่งข้อมูลภายในเฉพาะผู้มีสิทธิ์ club:view_internal
  const [club, current] = await Promise.all([apiGetJson<ClubPage>(`/clubs/${encodeURIComponent(clubId)}`), getCurrentUser()]);
  if (!current) redirect('/login');
  const canViewInternal = club.me.permissions.includes('club:view_internal');
  const canApproveMembers = club.me.permissions.includes('club_member:approve') && club.status === 'active';
  const [members, requests] = await Promise.all([
    canViewInternal ? apiGetJson<{ items: ClubMember[]; total: number }>(`/clubs/${club.id}/members?pageSize=100`) : null,
    canApproveMembers ? apiGetJson<{ items: MembershipRequest[] }>(`/clubs/${club.id}/membership-requests`) : null,
  ]);
  const statusLabel = STATUS_LABEL[club.status];

  return (
    <>
      <PageHeader
        eyebrow="Club"
        title={club.nameTh}
        description={club.motto ? `“${club.motto}”` : undefined}
        back={{ href: '/clubs', label: 'ทำเนียบชมรม' }}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="matcha">{club.category.nameTh}</Badge>
            {statusLabel && <Badge tone="beni">{statusLabel}</Badge>}
            {club.me.positions.map((position) => (
              <Badge key={position} tone="kin">
                {position}
              </Badge>
            ))}
            {club.me.isAdvisor && <Badge tone="kin">ที่ปรึกษาชมรม</Badge>}
            {club.me.membershipStatus === 'active' && <Badge tone="matcha">สมาชิก</Badge>}
            {club.me.membershipStatus === 'pending' && <Badge tone="sky">รออนุมัติสมาชิก</Badge>}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-3">วัตถุประสงค์</BentoTitle>
          {club.objectives.length > 0 ? (
            <ol className="grid gap-2">
              {club.objectives.map((objective, index) => (
                <li key={index} className="flex gap-3 text-[0.9375rem]">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-matcha-300 font-serif text-sm text-matcha-700">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{objective}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-stone">—</p>
          )}
          {club.history && (
            <>
              <BentoTitle className="mt-6 mb-2">ประวัติชมรม</BentoTitle>
              <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">{club.history}</p>
            </>
          )}
        </Bento>

        <Bento tone="cream">
          <BentoLabel>สมาชิก</BentoLabel>
          <p className="mt-1 font-serif text-4xl font-medium tabular-nums">{club.memberCount.toLocaleString('th-TH')}</p>
          <dl className="mt-3 divide-y divide-ink/[0.08]">
            <InfoRow label="ก่อตั้งเมื่อ" value={formatDate(club.establishedOn)} />
            <InfoRow label="ทะเบียนมีผลถึง" value={formatDate(club.registeredUntil)} />
            <InfoRow label="สถานที่ทำการ" value={club.officeLocation} />
            <InfoRow label="ติดต่อ" value={[club.contactPhone, club.contactEmail].filter(Boolean).join(' · ')} />
          </dl>
        </Bento>

        {requests && (
          <Bento className="lg:col-span-2">
            <BentoTitle className="mb-3">ใบสมัครที่รออนุมัติ ({requests.items.length})</BentoTitle>
            {requests.items.length === 0 ? (
              <p className="text-sm text-stone">ไม่มีใบสมัครที่รออนุมัติ</p>
            ) : (
              <ul className="grid gap-2">
                {requests.items.map((request) => (
                  <li key={request.membershipId} className="flex flex-col gap-3 rounded-xl border border-ink/[0.08] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{request.name ?? request.email}</p>
                      <p className="text-xs text-stone">
                        {request.orgUnitName ?? request.email} · สมัครเมื่อ {formatDateTime(request.appliedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton path={`/clubs/${club.id}/memberships/${request.membershipId}/approve`} label="อนุมัติ" />
                      <ActionButton path={`/clubs/${club.id}/memberships/${request.membershipId}/reject`} label="ไม่อนุมัติ" note="optional" tone="neutral" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Bento>
        )}

        <div className={requests ? '' : 'lg:col-start-3 lg:row-start-2'}>
          <MembershipPanel club={club} eligible={current.profile.type === 'staff'} />
        </div>

        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-3">คณะกรรมการบริหาร</BentoTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {club.committee.map((member) => (
              <li key={member.userId} className="rounded-xl border border-ink/[0.08] p-3">
                <p className="text-xs text-matcha-700">{member.positionTitle}</p>
                <p className="mt-0.5 font-medium">{member.name}</p>
                <p className="text-xs text-stone">{member.orgUnitName ?? '—'}</p>
                {canViewInternal && (member.contactPhone || member.email) && (
                  <p className="mt-1 text-xs text-stone">{[member.contactPhone, member.email].filter(Boolean).join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
        </Bento>

        <Bento>
          <BentoTitle className="mb-3">ที่ปรึกษาชมรม</BentoTitle>
          <ul className="grid gap-2">
            {club.advisors.map((advisor, index) => (
              <li key={index} className="rounded-xl border border-ink/[0.08] p-3">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {advisor.name}
                  {advisor.kind === 'external' && <Badge tone="kin">บุคคลภายนอก</Badge>}
                </p>
                <p className="text-xs text-stone">{[advisor.position, advisor.organization].filter(Boolean).join(' · ') || '—'}</p>
                {canViewInternal && (advisor.phone || advisor.email) && (
                  <p className="mt-1 text-xs text-stone">{[advisor.phone, advisor.email].filter(Boolean).join(' · ')}</p>
                )}
              </li>
            ))}
            {club.advisors.length === 0 && <li className="text-sm text-stone">—</li>}
          </ul>
        </Bento>

        {members && (
          <Bento className="lg:col-span-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <BentoTitle>รายชื่อสมาชิก ({members.total.toLocaleString('th-TH')} คน)</BentoTitle>
              <Badge tone="neutral">ข้อมูลภายในชมรม</Badge>
            </div>
            <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {members.items.map((member) => (
                <li key={member.userId} className="border-b border-ink/[0.06] py-2">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
                    {member.name ?? member.email}
                    {member.isCommittee && <Badge tone="kin">กรรมการ</Badge>}
                  </p>
                  <p className="text-xs text-stone">{member.orgUnitName ?? member.email}</p>
                  {canApproveMembers && !member.isCommittee && member.userId !== current.user.id && (
                    <RemoveMemberButton clubId={club.id} membershipId={member.membershipId} memberName={member.name ?? member.email} />
                  )}
                </li>
              ))}
            </ul>
          </Bento>
        )}

        {club.regulationText && (
          <details className="bento p-5 sm:p-6 lg:col-span-3">
            <summary className="cursor-pointer font-serif text-lg font-medium">ระเบียบข้อบังคับของชมรม</summary>
            <pre className="mt-3 font-sans text-sm leading-7 whitespace-pre-wrap">{club.regulationText}</pre>
          </details>
        )}
      </div>
    </>
  );
}
