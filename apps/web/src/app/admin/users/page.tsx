import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/RoleBadge';
import { apiGetJson } from '@/lib/api-server';
import type { AdminRole, AdminUserPage } from '@/lib/admin-types';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = '', page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q.trim()) query.set('q', q.trim());

  // API ตรวจสิทธิ์ (user_role:assign) ถ้าไม่มีสิทธิ์จะถูกพาไปหน้า "ไม่มีสิทธิ์เข้าถึง"
  const [data, roles] = await Promise.all([
    apiGetJson<AdminUserPage>(`/admin/users?${query.toString()}`),
    apiGetJson<{ items: AdminRole[] }>('/admin/roles'),
  ]);
  const roleByCode = new Map(roles.items.map((role) => [role.code, role]));
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const pageLink = (target: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return (
    <>
      <PageHeader eyebrow="Administration" title="จัดการสิทธิ์ผู้ใช้" description="ค้นหาผู้ใช้เพื่อให้หรือถอน role ทุกการเปลี่ยนแปลงถูกบันทึกพร้อมเหตุผล" />
      <form className="flex flex-col gap-2 sm:flex-row" action="/admin/users">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาด้วยชื่อหรืออีเมล"
          className="w-full field"
        />
        <button type="submit" className="btn btn-primary shrink-0">
          ค้นหา
        </button>
      </form>

      <p className="mt-4 text-sm text-stone">พบ {data.total.toLocaleString('th-TH')} คน</p>

      {data.items.length === 0 ? (
        <EmptyState icon="users" title="ไม่พบผู้ใช้ที่ตรงกับคำค้น" />
      ) : (
        <ul className="mt-3 bento divide-y divide-ink/[0.06] !p-0 overflow-hidden">
          {data.items.map((user) => (
            <li key={user.id}>
              <Link
                href={`/admin/users/${user.id}`}
                className="flex flex-col gap-2 p-4 hover:bg-matcha-50/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {user.name ?? user.email}
                    {!user.isActive && <span className="ml-2 text-xs text-beni">(ปิดการใช้งาน)</span>}
                  </p>
                  <p className="text-sm text-stone">{user.email}</p>
                  <p className="text-xs text-mist">เข้าสู่ระบบล่าสุด {formatDateTime(user.lastLoginAt)}</p>
                </div>
                <div className="flex flex-wrap gap-1 sm:justify-end">
                  {user.roles.map((code) => (
                    <RoleBadge
                      key={code}
                      label={roleByCode.get(code)?.nameTh ?? code}
                      privileged={roleByCode.get(code)?.isPrivileged}
                    />
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageLink(page - 1)} className="text-matcha-700 underline">← ก่อนหน้า</Link> : <span />}
          <span className="text-stone">หน้า {page} / {totalPages}</span>
          {page < totalPages ? <Link href={pageLink(page + 1)} className="text-matcha-700 underline">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
