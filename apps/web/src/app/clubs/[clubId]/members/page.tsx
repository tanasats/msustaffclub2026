import Link from 'next/link';
import { RemoveMemberButton } from '@/components/clubs/RemoveMemberButton';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ClubPage } from '@/lib/club-types';
import { formatDate, formatTimestampDate } from '@/lib/format';
import { MEMBERSHIP_END_REASON_LABELS, type MemberListItem } from '@/lib/member-types';
import { publicEnv } from '@/lib/public-env';

const PAGE_SIZE = 30;
const STATUS_TABS = [
  { value: 'active', label: 'สมาชิกปัจจุบัน' },
  { value: 'ended', label: 'พ้นสภาพแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
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
  const status = STATUS_TABS.some((t) => t.value === sp.status) ? (sp.status as (typeof STATUS_TABS)[number]['value']) : 'active';
  const role = sp.role === 'committee' || sp.role === 'member' ? sp.role : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const query = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
  if (role) query.set('role', role);
  if (sp.q?.trim()) query.set('q', sp.q.trim());

  const id = encodeURIComponent(clubId);
  const [club, data, current] = await Promise.all([
    apiGetJson<ClubPage>(`/clubs/${id}`),
    apiGetJson<{ items: MemberListItem[]; total: number }>(`/clubs/${id}/members?${query}`),
    getCurrentUser(),
  ]);
  const canManage = club.me.permissions.includes('club_member:approve') && club.status === 'active';
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

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="สถานะสมาชิก">
          {STATUS_TABS.map((t) => (
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
          {canExport && data.total > 0 && (
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
                </Link>
                <p className="mt-0.5 text-xs text-stone">
                  {[m.orgUnitName, m.email].filter(Boolean).join(' · ')}
                  {m.status === 'active' && m.joinedAt && ` · สมาชิกตั้งแต่ ${formatTimestampDate(m.joinedAt)}`}
                  {m.status === 'ended' && ` · พ้นสภาพ ${formatDate(m.endedOn)} (${MEMBERSHIP_END_REASON_LABELS[m.endReason ?? ''] ?? m.endReason})`}
                </p>
              </div>
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
