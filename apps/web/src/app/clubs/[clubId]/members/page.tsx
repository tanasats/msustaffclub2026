import Link from 'next/link';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { InviteMemberForm } from '@/components/clubs/InviteMemberForm';
import { MemberSummaryPanel } from '@/components/clubs/MemberSummaryPanel';
import { RemoveMemberButton } from '@/components/clubs/RemoveMemberButton';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ClubPage } from '@/lib/club-types';
import { formatDate, formatTimestampDate } from '@/lib/format';
import {
  MEMBERSHIP_END_REASON_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  type Invitation,
  type MemberListItem,
  type MemberSummary,
} from '@/lib/member-types';
import { publicEnv } from '@/lib/public-env';

const PAGE_SIZE = 30;
const STATUS_TABS = [
  { value: 'active', label: 'สมาชิกปัจจุบัน' },
  { value: 'ended', label: 'พ้นสภาพแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
  // เฉพาะผู้มี club_membership:manage_deleted (API ตรวจซ้ำ)
  { value: 'deleted', label: 'ลบแล้ว' },
] as const;
const ROLE_CHIPS = [
  { value: undefined, label: 'ทุกบทบาท' },
  { value: 'committee', label: 'กรรมการ' },
  { value: 'member', label: 'สมาชิกทั่วไป' },
] as const;

interface SearchParams {
  q?: string;
  status?: string;
  role?: string;
  page?: string;
}

// รายชื่อสมาชิกของชมรม ค้นหา/กรอง (API ต้องมีสิทธิ์ชมรม club:view_internal ไม่มีสิทธิ์ → หน้าไม่มีสิทธิ์)
export default async function ClubMembersPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<SearchParams> }) {
  const { clubId } = await params;
  const sp = await searchParams;
  const current = await getCurrentUser();
  const canSeeDeleted = Boolean(current && (current.roles.includes('super_admin') || current.permissions.includes('club_membership:manage_deleted')));
  const tabs = STATUS_TABS.filter((t) => t.value !== 'deleted' || canSeeDeleted);
  const status = tabs.some((t) => t.value === sp.status) ? (sp.status as (typeof STATUS_TABS)[number]['value']) : 'active';
  const role = sp.role === 'committee' || sp.role === 'member' ? sp.role : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const query = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
  if (role) query.set('role', role);
  if (sp.q?.trim()) query.set('q', sp.q.trim());

  const id = encodeURIComponent(clubId);
  const [club, data, summary] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: MemberListItem[]; total: number }>(`/clubs/${id}/members?${query}`),
    apiGetJson<MemberSummary>(`/clubs/${id}/members/summary`),
  ]);
  const canManage = club.me.permissions.includes('club_member:approve') && club.status === 'active';
  const invitations = canManage ? await apiGetJson<{ items: Invitation[] }>(`/clubs/${id}/invitations`) : null;
  // ส่งออกใช้ตัวกรองเดียวกับที่แสดง (ไม่รวมหน้า) — ดาวน์โหลดตรงจาก API พร้อม cookie ของผู้ใช้
  const exportQuery = new URLSearchParams(query);
  exportQuery.delete('page');
  exportQuery.delete('pageSize');
  const canExport = club.me.permissions.includes('club_member:approve');
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  // สร้างลิงก์โดยคงตัวกรองเดิม แล้วเปลี่ยนเฉพาะค่าที่ระบุ
  const link = (changes: Partial<SearchParams>) => {
    const next = { q: sp.q, status: status === 'active' ? undefined : status, role, ...changes };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/clubs/${club.id}/members${qs.size ? `?${qs}` : ''}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition ${
      active ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.12] bg-white text-stone hover:border-matcha-300 hover:text-matcha-800'
    }`;

  return (
    <>
      <PageHeader eyebrow="Members" title="รายชื่อสมาชิก" description={club.nameTh} back={{ href: `/clubs/${club.id}`, label: club.nameTh }} />

      <MemberSummaryPanel summary={summary} />

      {invitations && (
        <Bento className="mb-4">
          <BentoTitle className="mb-3">เชิญบุคลากรเข้าชมรม</BentoTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <InviteMemberForm clubId={club.id} excludeIds={invitations.items.map((i) => i.userId)} />
            <div>
              <p className="mb-2 text-sm font-medium">คำเชิญที่รอตอบ ({invitations.items.length})</p>
              {invitations.items.length === 0 ? (
                <p className="text-sm text-stone">ไม่มีคำเชิญที่รอตอบ</p>
              ) : (
                <ul className="grid gap-2">
                  {invitations.items.map((i) => (
                    <li key={i.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/[0.08] px-3 py-2 text-sm">
                      <span>
                        {i.name ?? i.email}
                        <span className="block text-xs text-stone">
                          เชิญเมื่อ {formatTimestampDate(i.invitedAt)}
                          {i.invitedByName && ` โดย ${i.invitedByName}`}
                        </span>
                      </span>
                      <ActionButton path={`/clubs/${club.id}/memberships/${i.membershipId}/cancel-invitation`} label="ยกเลิกคำเชิญ" tone="neutral" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Bento>
      )}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="สถานะสมาชิก">
          {tabs.map((t) => (
            <Link key={t.value} href={link({ status: t.value === 'active' ? undefined : t.value, page: undefined })} role="tab" aria-selected={status === t.value} className={chip(status === t.value)}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="บทบาท">
          {ROLE_CHIPS.map((r) => (
            <Link key={r.label} href={link({ role: r.value, page: undefined })} className={chip(role === r.value)}>
              {r.label}
            </Link>
          ))}
        </div>
        <form action={`/clubs/${club.id}/members`} className="flex flex-col gap-2 sm:flex-row">
          {status !== 'active' && <input type="hidden" name="status" value={status} />}
          {role && <input type="hidden" name="role" value={role} />}
          <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="ค้นหาชื่อ อีเมล หรือหน่วยงาน" aria-label="ค้นหาสมาชิก" className="field" />
          <button type="submit" className="btn btn-primary shrink-0">
            <Icon name="search" className="size-[1.125rem]" />
            ค้นหา
          </button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-stone">พบ {data.total.toLocaleString('th-TH')} คน</p>
          {canExport && data.total > 0 && status !== 'deleted' && (
            <a href={`${publicEnv.apiUrl}/clubs/${club.id}/members/export?${exportQuery}`} className="btn btn-secondary !min-h-10 text-sm" download>
              <Icon name="download" className="size-[1.125rem]" />
              ส่งออก CSV ({data.total.toLocaleString('th-TH')} คน)
            </a>
          )}
        </div>
        {canExport && (
          <p className="text-xs text-stone">
            ไฟล์ที่ส่งออกมีข้อมูลส่วนบุคคล ใช้เพื่องานของชมรมเท่านั้น และระบบบันทึกทุกครั้งที่มีการส่งออก
          </p>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon="users" title="ไม่พบสมาชิกที่ตรงกับเงื่อนไข" />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {data.items.map((m) => (
            <li key={m.membershipId} className="bento flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <Link href={`/clubs/${club.id}/members/${m.userId}`} className="flex flex-wrap items-center gap-2 font-medium text-ink underline-offset-2 hover:underline">
                  {m.name ?? m.email}
                  {m.isCommittee && <Badge tone="kin">{m.positionTitle ?? 'กรรมการ'}</Badge>}
                  {m.status === 'ended' && <Badge tone="neutral">พ้นสภาพ</Badge>}
                  {m.resignRequestedAt && <Badge tone="beni">ยื่นลาออก</Badge>}
                  {m.status === 'deleted' && <Badge tone="beni">ลบแล้ว</Badge>}
                </Link>
                <p className="mt-0.5 text-xs text-stone">
                  {[m.orgUnitName, m.email].filter(Boolean).join(' · ')}
                  {m.status === 'active' && m.joinedAt && ` · สมาชิกตั้งแต่ ${formatTimestampDate(m.joinedAt)}`}
                  {m.status === 'ended' && ` · พ้นสภาพ ${formatDate(m.endedOn)} (${MEMBERSHIP_END_REASON_LABELS[m.endReason ?? ''] ?? m.endReason})`}
                  {m.status === 'deleted' &&
                    ` · ลบเมื่อ ${formatTimestampDate(m.deletedAt)}${m.deletedByName ? ` โดย ${m.deletedByName}` : ''} · สถานะเดิม: ${MEMBERSHIP_STATUS_LABELS[m.statusBeforeDelete ?? 'active']}`}
                </p>
              </div>
              {m.status === 'deleted' && canSeeDeleted && (
                <ActionButton path={`/clubs/${club.id}/memberships/${m.membershipId}/restore`} label="กู้คืนรายชื่อ" note="required" tone="neutral" />
              )}
              {canManage && m.status === 'active' && !m.isCommittee && m.userId !== current?.user.id && (
                <RemoveMemberButton clubId={club.id} membershipId={m.membershipId} memberName={m.name ?? m.email} />
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="เปลี่ยนหน้า">
          {page > 1 ? <Link href={link({ page: String(page - 1) })} className="btn btn-secondary">← ก่อนหน้า</Link> : <span />}
          <span className="text-stone">หน้า {page} / {totalPages}</span>
          {page < totalPages ? <Link href={link({ page: String(page + 1) })} className="btn btn-secondary">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
