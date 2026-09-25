import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AchievementListItem } from '@/components/achievements/AchievementListItem';
import { ActivityListItem } from '@/components/activities/ActivityListItem';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { ClubLogo } from '@/components/clubs/ClubLogo';
import { CommitteeManager } from '@/components/clubs/CommitteeManager';
import { EndCommitteeTermButton } from '@/components/clubs/EndCommitteeTermButton';
import { LogoUploader } from '@/components/clubs/LogoUploader';
import { MembershipPanel } from '@/components/clubs/MembershipPanel';
import { RemoveMemberButton } from '@/components/clubs/RemoveMemberButton';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { AchievementItem, AchievementPage } from '@/lib/achievement-types';
import type { ActivityItem } from '@/lib/activity-types';
import type { ClubPosition } from '@/lib/club-application-types';
import type { ClubMember, ClubPage, CommitteeHistoryItem, MembershipRequest } from '@/lib/club-types';
import { committeeEndReasonLabel } from '@/lib/committee-labels';
import { formatDate, formatDateTime } from '@/lib/format';

// ใช้หาแถวประธานเพื่อเลือกแสดงปุ่มเท่านั้น (API ตรวจกฎจริง)
const PRESIDENT_CODE = 'president';

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
  const canManageCommittee = club.me.permissions.includes('club_committee:manage') && club.status === 'active';
  const canEditProfile = club.me.permissions.includes('club_profile:edit') && club.status === 'active';
  const canReviewAchievements = club.me.permissions.includes('club_achievement:manage') && club.status === 'active';
  const canSubmitAchievement = club.me.membershipStatus === 'active' && club.status === 'active';
  const [members, requests, positions, history, achievements, achievementQueue, activities] = await Promise.all([
    canViewInternal ? apiGetJson<{ items: ClubMember[]; total: number }>(`/clubs/${club.id}/members?pageSize=100`) : null,
    canApproveMembers ? apiGetJson<{ items: MembershipRequest[] }>(`/clubs/${club.id}/membership-requests`) : null,
    canManageCommittee ? apiGetJson<{ items: ClubPosition[] }>('/club-positions') : null,
    canViewInternal ? apiGetJson<{ items: CommitteeHistoryItem[] }>(`/clubs/${club.id}/committee/history`) : null,
    apiGetJson<AchievementPage>(`/clubs/${club.id}/achievements?pageSize=50`),
    canReviewAchievements ? apiGetJson<{ items: AchievementItem[] }>(`/clubs/${club.id}/achievement-reviews`) : null,
    apiGetJson<{ fiscalYear: number; items: ActivityItem[] }>(`/clubs/${club.id}/activities`),
  ]);
  const statusLabel = STATUS_LABEL[club.status];
  const myId = current.user.id;
  const presidentId = club.committee.find((c) => c.positionCode === PRESIDENT_CODE)?.userId ?? null;
  const person = (m: ClubMember) => ({ userId: m.userId, name: m.name ?? m.email });
  const appointable = (members?.items ?? []).filter((m) => !m.isCommittee && m.userId !== myId).map(person);
  const transferable = (members?.items ?? []).filter((m) => m.userId !== presidentId && m.userId !== myId).map(person);

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
          {(club.logoFileId || club.logoMeaning || canEditProfile) && (
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
              <ClubLogo path={`/clubs/${club.id}/logo`} fileId={club.logoFileId} name={club.nameTh} size="lg" />
              <div className="min-w-0 flex-1">
                <BentoTitle className="mb-1">ตราสัญลักษณ์</BentoTitle>
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
                  {club.logoMeaning ?? (club.logoFileId ? '' : 'ยังไม่มีตราสัญลักษณ์')}
                </p>
                {canEditProfile && (
                  <div className="mt-3">
                    <LogoUploader attachPath={`/clubs/${club.id}/logo`} hasLogo={Boolean(club.logoFileId)} />
                  </div>
                )}
              </div>
            </div>
          )}
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
          <MembershipPanel club={club} eligible={current.profile.type === 'staff'} isPresident={presidentId === myId} />
        </div>

        {/* กรรมการสูง 2 แถว ให้กล่องที่ปรึกษาอยู่คอลัมน์ขวาใต้กล่องสมาชิกภาพ ไม่ตกไปขึ้นแถวใหม่ */}
        <Bento className="lg:col-span-2 lg:row-span-2">
          <BentoTitle className="mb-3">คณะกรรมการบริหาร</BentoTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {club.committee.map((member) => (
              <li key={member.id} className="rounded-xl border border-ink/[0.08] p-3">
                <p className="text-xs text-matcha-700">{member.positionTitle}</p>
                <p className="mt-0.5 font-medium">{member.name}</p>
                <p className="text-xs text-stone">{member.orgUnitName ?? '—'}</p>
                {canViewInternal && (member.contactPhone || member.email) && (
                  <p className="mt-1 text-xs text-stone">{[member.contactPhone, member.email].filter(Boolean).join(' · ')}</p>
                )}
                {canViewInternal && <p className="mt-1 text-xs text-mist">ตั้งแต่ {formatDate(member.startedOn)}</p>}
                {canManageCommittee && member.positionCode !== PRESIDENT_CODE && member.userId !== myId && (
                  <EndCommitteeTermButton clubId={club.id} committeeMemberId={member.id} memberName={member.name} />
                )}
              </li>
            ))}
            {club.committee.length === 0 && <li className="text-sm text-stone">ยังไม่มีกรรมการ</li>}
          </ul>
          {canManageCommittee && members && (
            <div className="mt-4">
              <CommitteeManager
                clubId={club.id}
                appointable={appointable}
                transferable={transferable}
                positions={(positions?.items ?? []).filter((p) => p.kind === 'committee' && p.code !== PRESIDENT_CODE)}
              />
              {members.total > members.items.length && (
                <p className="mt-2 text-xs text-stone">แสดงรายชื่อให้เลือก {members.items.length} คนแรกจาก {members.total} คน</p>
              )}
            </div>
          )}
          {history && history.items.length > 0 && (
            <details className="mt-4 rounded-xl border border-ink/[0.08] p-3">
              <summary className="cursor-pointer text-sm font-medium">ประวัติกรรมการที่พ้นตำแหน่ง ({history.items.length})</summary>
              <ul className="mt-2 divide-y divide-ink/[0.06]">
                {history.items.map((h) => (
                  <li key={h.id} className="py-2 text-sm">
                    <p>
                      <span className="font-medium">{h.name ?? h.email}</span> · {h.positionTitle}
                    </p>
                    <p className="text-xs text-stone">
                      {formatDate(h.startedOn)} – {formatDate(h.endedOn)} · {committeeEndReasonLabel(h.endReason)}
                      {h.endedByName && ` · โดย ${h.endedByName}`}
                    </p>
                    {h.endNote && <p className="text-xs text-stone">หมายเหตุ: {h.endNote}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Bento>

        <Bento className="lg:col-start-3">
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

        <Bento className="lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <BentoTitle>กิจกรรมปีงบประมาณ {activities.fiscalYear} ({activities.items.length})</BentoTitle>
            <Link href={`/clubs/${club.id}/activities`} className="btn btn-secondary !min-h-10 text-sm">
              แผนและกิจกรรมทั้งหมด
            </Link>
          </div>
          {activities.items.length === 0 ? (
            <p className="text-sm text-stone">ยังไม่มีกิจกรรมที่บันทึกในปีงบประมาณนี้</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {activities.items.slice(0, 6).map((item) => (
                <ActivityListItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Bento>

        <Bento className="lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <BentoTitle>ผลงานของชมรม ({achievements.total.toLocaleString('th-TH')})</BentoTitle>
            <div className="flex flex-wrap gap-2">
              {achievementQueue && (
                <Link href={`/clubs/${club.id}/achievements/review`} className="btn btn-secondary !min-h-10 text-sm">
                  รอรับรอง ({achievementQueue.items.length})
                </Link>
              )}
              {canSubmitAchievement && (
                <Link href={`/clubs/${club.id}/achievements/new`} className="btn btn-primary !min-h-10 text-sm">
                  บันทึกผลงาน
                </Link>
              )}
            </div>
          </div>
          {achievements.items.length === 0 ? (
            <p className="text-sm text-stone">ยังไม่มีผลงานที่รับรองแล้ว</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {achievements.items.map((item) => (
                <AchievementListItem key={item.id} item={item} show="owner" />
              ))}
            </ul>
          )}
          {achievements.total > achievements.items.length && (
            <p className="mt-2 text-xs text-stone">แสดง {achievements.items.length} รายการล่าสุด</p>
          )}
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
