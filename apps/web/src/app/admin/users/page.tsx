import Link from 'next/link';
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← หน้าแรก
      </Link>
      <h1 className="mt-2 text-2xl font-bold">จัดการสิทธิ์ผู้ใช้</h1>

      <form className="mt-6 flex flex-col gap-2 sm:flex-row" action="/admin/users">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาด้วยชื่อหรืออีเมล"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">
          ค้นหา
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-600">พบ {data.total.toLocaleString('th-TH')} คน</p>

      {data.items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">
          ไม่พบผู้ใช้ที่ตรงกับคำค้น
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.items.map((user) => (
            <li key={user.id}>
              <Link
                href={`/admin/users/${user.id}`}
                className="flex flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {user.name ?? user.email}
                    {!user.isActive && <span className="ml-2 text-xs text-red-700">(ปิดการใช้งาน)</span>}
                  </p>
                  <p className="text-sm text-slate-600">{user.email}</p>
                  <p className="text-xs text-slate-500">เข้าสู่ระบบล่าสุด {formatDateTime(user.lastLoginAt)}</p>
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
          {page > 1 ? <Link href={pageLink(page - 1)} className="text-blue-700 underline">← ก่อนหน้า</Link> : <span />}
          <span className="text-slate-600">หน้า {page} / {totalPages}</span>
          {page < totalPages ? <Link href={pageLink(page + 1)} className="text-blue-700 underline">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
