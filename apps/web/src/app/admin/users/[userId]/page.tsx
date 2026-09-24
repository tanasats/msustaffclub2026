import Link from 'next/link';
import { GrantRoleForm } from '@/components/admin/GrantRoleForm';
import { RevokeRoleButton } from '@/components/admin/RevokeRoleButton';
import { RoleBadge } from '@/components/RoleBadge';
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/users" className="text-sm text-blue-700 underline">
        ← รายชื่อผู้ใช้
      </Link>

      <section className="mt-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h1 className="text-xl font-bold sm:text-2xl">{user.name ?? user.email}</h1>
        <p className="text-slate-600">{user.email}</p>
        {user.orgUnitName && <p className="text-sm text-slate-600">{user.orgUnitName}</p>}
        {!user.isActive && <p className="mt-2 text-sm font-medium text-red-700">บัญชีนี้ถูกปิดการใช้งาน</p>}
        {isSelf && <p className="mt-2 text-sm text-amber-800">นี่คือบัญชีของคุณ — แก้ไข role ของตนเองไม่ได้</p>}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">role ปัจจุบัน</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {overview.roles.map((role) => (
            <li key={role.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <RoleBadge label={role.nameTh} privileged={role.isPrivileged} />
                <p className="mt-1 text-xs text-slate-500">
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
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-3 font-semibold">ให้ role เพิ่ม</h2>
          <GrantRoleForm userId={user.id} options={grantOptions} />
        </section>
      )}

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">ประวัติการให้/ถอน role</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {history.map((item) => (
              <li key={item.id} className="py-2">
                <span className={item.action === 'grant' ? 'text-green-800' : 'text-red-800'}>
                  {item.action === 'grant' ? 'ให้' : 'ถอน'}
                </span>{' '}
                <span className="font-medium">{item.roleNameTh}</span> — {item.reason}
                <p className="text-xs text-slate-500">
                  {formatDateTime(item.createdAt)} โดย {item.actorName ?? 'ระบบ'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
