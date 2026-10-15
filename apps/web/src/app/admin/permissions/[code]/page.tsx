import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { PermissionHolders, PermissionOverview } from '@/lib/permission-admin-types';

// ผู้ถือสิทธิ์ 1 ข้อ (ผ่าน role) — permission role_permission:manage
export default async function PermissionHoldersPage({ params }: { params: Promise<{ code: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('role_permission:manage')) redirect('/forbidden');
  const code = decodeURIComponent((await params).code);
  const [data, overview] = await Promise.all([
    apiGetJson<PermissionHolders>(`/admin/permissions/${encodeURIComponent(code)}/holders`),
    apiGetJson<PermissionOverview>('/admin/permissions'),
  ]);
  const permission = overview.permissions.find((p) => p.code === code);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title={code}
        description={permission?.descriptionTh}
        back={{ href: '/admin/permissions', label: 'สิทธิ์ในระบบ' }}
      />
      <Bento>
        <p className="mb-3 text-sm text-stone">
          ผู้ถือผ่าน role: {permission?.roles.map((r) => r.nameTh).join(', ') || 'ยังไม่ผูก role'} · และผู้ดูแลระบบสูงสุด {data.superAdminCount} คน (ผ่านทุกสิทธิ์)
        </p>
        {data.holders.length === 0 ? (
          <p className="text-sm text-stone">ไม่มีผู้ใช้ถือสิทธิ์นี้ผ่าน role</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {data.holders.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <Link href={`/admin/users/${h.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                    {h.name ?? h.email}
                  </Link>
                  <span className="text-stone"> · {h.orgUnitName ?? h.email}</span>
                </span>
                <span className="text-stone">ผ่าน {h.roles.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        {data.holders.length >= data.limit && <p className="mt-3 text-xs text-stone">แสดง {data.limit} คนแรก</p>}
      </Bento>
    </>
  );
}
