import Link from 'next/link';
import { RemoveMemberButton } from '@/components/clubs/RemoveMemberButton';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { CATEGORY_LABELS, LEVEL_LABELS, STATUS_LABELS as ACHIEVEMENT_STATUS_LABELS, type AchievementCategory, type AchievementLevel, type AchievementStatus } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ClubPage } from '@/lib/club-types';
import { formatDate, formatDateTime, formatTimestampDate } from '@/lib/format';
import { MEMBERSHIP_ACTION_LABELS, MEMBERSHIP_END_REASON_LABELS, MEMBERSHIP_STATUS_LABELS, type MemberProfile } from '@/lib/member-types';

const MEDAL_LABELS: Record<string, string> = { gold: 'เหรียญทอง', silver: 'เหรียญเงิน', bronze: 'เหรียญทองแดง' };

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-stone">{text}</p>;
}

// ข้อมูลรายบุคคลของสมาชิกในชมรมนี้ (API ต้องมีสิทธิ์ชมรม club:view_internal, ไม่ใช่สมาชิก/ผู้สมัครของชมรม → 404)
export default async function ClubMemberPage({ params }: { params: Promise<{ clubId: string; userId: string }> }) {
  const { clubId, userId } = await params;
  const id = encodeURIComponent(clubId);
  const [club, profile, current] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<MemberProfile>(`/clubs/${id}/members/${encodeURIComponent(userId)}`),
    getCurrentUser(),
  ]);
  const { person } = profile;
  const isCommittee = profile.positions.some((p) => p.endedOn === null);
  const canRemove =
    club.me.permissions.includes('club_member:approve') && club.status === 'active' && person.status === 'active' && !isCommittee && person.userId !== current?.user.id;

  return (
    <>
      <PageHeader
        eyebrow="Member"
        title={person.name ?? person.email}
        description={`${club.nameTh} · ${[person.orgUnitName, person.email].filter(Boolean).join(' · ')}`}
        back={{ href: `/clubs/${club.id}/members`, label: 'รายชื่อสมาชิก' }}
      />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento tone="cream">
          <BentoTitle className="mb-3">สมาชิกภาพ</BentoTitle>
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={person.status === 'active' ? 'matcha' : person.status === 'pending' ? 'sky' : 'neutral'}>{MEMBERSHIP_STATUS_LABELS[person.status]}</Badge>
            {isCommittee && <Badge tone="kin">กรรมการ</Badge>}
          </p>
          <dl className="mt-3 grid gap-1 text-sm">
            {person.appliedAt && <div>สมัครเมื่อ {formatTimestampDate(person.appliedAt)}</div>}
            {person.joinedAt && person.status !== 'rejected' && <div>เป็นสมาชิกตั้งแต่ {formatTimestampDate(person.joinedAt)}</div>}
            {person.status === 'ended' && (
              <div>
                พ้นสภาพ {formatDate(person.endedOn)} ({MEMBERSHIP_END_REASON_LABELS[person.endReason ?? ''] ?? person.endReason})
              </div>
            )}
          </dl>
          {canRemove && (
            <div className="mt-4">
              <RemoveMemberButton clubId={club.id} membershipId={person.membershipId} memberName={person.name ?? person.email} />
            </div>
          )}
        </Bento>

        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-3">ผลงานในชมรมนี้ ({profile.achievements.length})</BentoTitle>
          {profile.achievements.length === 0 ? (
            <Empty text="ยังไม่มีผลงานที่บันทึกในชมรมนี้" />
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {profile.achievements.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/achievements/${a.id}`} className="font-medium underline-offset-2 hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-xs text-stone">
                      {formatDate(a.achievedOn)} · {LEVEL_LABELS[a.level as AchievementLevel] ?? a.level} · {CATEGORY_LABELS[a.category as AchievementCategory] ?? a.category}
                      {a.award && ` · ${a.award}`}
                    </p>
                  </div>
                  <Badge tone={a.status === 'approved' ? 'matcha' : a.status === 'pending' ? 'sky' : 'neutral'}>
                    {ACHIEVEMENT_STATUS_LABELS[a.status as AchievementStatus] ?? a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Bento>

        <Bento>
          <BentoTitle className="mb-3">ตำแหน่งกรรมการ</BentoTitle>
          {profile.positions.length === 0 ? (
            <Empty text="ไม่เคยดำรงตำแหน่งกรรมการ" />
          ) : (
            <ul className="grid gap-2 text-sm">
              {profile.positions.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.positionTitle}</span>
                  <span className="block text-xs text-stone">
                    {formatDate(p.startedOn)} – {p.endedOn ? formatDate(p.endedOn) : 'ปัจจุบัน'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bento>

        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-3">กิจกรรมที่เข้าร่วม ({profile.activities.total})</BentoTitle>
          {profile.activities.items.length === 0 ? (
            <Empty text="ยังไม่มีบันทึกการเข้าร่วมกิจกรรม" />
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {profile.activities.items.map((a) => (
                <li key={a.id} className="border-b border-ink/[0.06] py-2 text-sm">
                  <Link href={`/activities/${a.id}`} className="underline-offset-2 hover:underline">
                    {a.title}
                  </Link>
                  <span className="block text-xs text-stone">{formatDate(a.heldOn)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bento>

        {profile.competitionResults.length > 0 && (
          <Bento className="lg:col-span-3">
            <BentoTitle className="mb-3">ผลการแข่งขันในนามชมรม ({profile.competitionResults.length})</BentoTitle>
            <ul className="divide-y divide-ink/[0.06]">
              {profile.competitionResults.map((r) => (
                <li key={r.competitionId} className="py-2 text-sm">
                  <Link href={`/competitions/${r.competitionId}`} className="font-medium underline-offset-2 hover:underline">
                    {r.title}
                  </Link>
                  <span className="block text-xs text-stone">
                    {r.sportName} · {formatDate(r.heldFrom)}
                    {r.rank !== null && ` · อันดับ ${r.rank}`}
                    {r.medal && ` · ${MEDAL_LABELS[r.medal] ?? r.medal}`}
                  </span>
                </li>
              ))}
            </ul>
          </Bento>
        )}

        <Bento className="lg:col-span-3">
          <BentoTitle className="mb-3">ประวัติสมาชิกภาพ</BentoTitle>
          {profile.history.length === 0 ? (
            <Empty text="—" />
          ) : (
            <ol className="grid gap-3 border-l-2 border-ink/[0.08] pl-4">
              {profile.history.map((h, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium">{MEMBERSHIP_ACTION_LABELS[h.action] ?? h.action}</p>
                  <p className="text-xs text-mist">
                    {formatDateTime(h.createdAt)} · {h.actorName ?? 'ระบบ'}
                  </p>
                  {h.note && <p className="mt-1 whitespace-pre-line">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Bento>
      </div>
    </>
  );
}
