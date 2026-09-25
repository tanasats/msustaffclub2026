import { GrantRoleForm } from '@/components/admin/GrantRoleForm';
import { RevokeRoleButton } from '@/components/admin/RevokeRoleButton';
import { RoleBadge } from '@/components/RoleBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { AdminRole, AdminUserOverview } from '@/lib/admin-types';
import { getCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [overview, roles, current] = await Promise.all([
    apiGetJson<AdminUserOverview>(`/admin/users/${encodeURIComponent(userId)}`),
    apiGetJson<{ items: AdminRole[] }>('/admin/roles'),
    getCurrentUser(),
  ]);
  const { user, history } = overview;
  const grantableByCode = new Map(roles.items.map((role) => [role.code, role.grantable]));
  const heldCodes = new Set(overview.roles.map((role) => role.code));
  // แก้ role ของตัวเองไม่ได้ (API ก็ปฏิเสธ) จึงไม่แสดงปุ่มเพื่อไม่ให้สับสน
  const isSelf = current?.user.id === user.id;
  const grantOptions = isSelf
    ? []
    : roles.items.filter((role) => role.grantable && !heldCodes.has(role.code));

  return (
    <>
      <PageHeader eyebrow="Administration" title={user.name ?? user.email} description={user.email} back={{ href: '/admin/users', label: 'รายชื่อผู้ใช้' }} />
      <section className="bento p-5 sm:p-6">
        <p className="text-sm text-stone">หน่วยงาน: {user.orgUnitName ?? '—'}</p>
        {!user.isActive && <p className="mt-2 text-sm font-medium text-beni">บัญชีนี้ถูกปิดการใช้งาน</p>}
        {isSelf && <p className="mt-2 text-sm text-kin">นี่คือบัญชีของคุณ — แก้ไข role ของตนเองไม่ได้</p>}
      </section>

      <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
        <h2 className="font-serif text-lg font-medium">role ปัจจุบัน</h2>
        <ul className="mt-2 divide-y divide-ink/[0.06]">
          {overview.roles.map((role) => (
            <li key={role.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <RoleBadge label={role.nameTh} privileged={role.isPrivileged} />
                <p className="mt-1 text-xs text-mist">
                  ได้รับเมื่อ {formatDateTime(role.grantedAt)} โดย {role.grantedByName ?? 'ระบบ'}
                </p>
              </div>
              {!isSelf && grantableByCode.get(role.code) && (
                <RevokeRoleButton userId={user.id} roleCode={role.code} roleName={role.nameTh} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {!isSelf && user.isActive && (
        <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
          <h2 className="mb-3 font-serif text-lg font-medium">ให้ role เพิ่ม</h2>
          <GrantRoleForm userId={user.id} options={grantOptions} />
        </section>
      )}

      <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
        <h2 className="font-serif text-lg font-medium">ประวัติการให้/ถอน role</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-stone">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/[0.06] text-sm">
            {history.map((item) => (
              <li key={item.id} className="py-2">
                <span className={item.action === 'grant' ? 'text-matcha-700' : 'text-beni'}>
                  {item.action === 'grant' ? 'ให้' : 'ถอน'}
                </span>{' '}
                <span className="font-medium">{item.roleNameTh}</span> — {item.reason}
                <p className="text-xs text-mist">
                  {formatDateTime(item.createdAt)} โดย {item.actorName ?? 'ระบบ'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
