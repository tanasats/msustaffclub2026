import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BindingToggle } from '@/components/permission-admin/BindingToggle';
import { RoleForm } from '@/components/permission-admin/RoleForm';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import {
  AUTO_ASSIGNED_ROLE_CODES,
  PERMISSION_LOG_ACTION_LABELS,
  type PermissionChangeLogPage,
  type PermissionOverview,
} from '@/lib/permission-admin-types';

const TABS = [
  { value: 'permissions', label: 'สิทธิ์ระบบ' },
  { value: 'roles', label: 'Role' },
  { value: 'club', label: 'สิทธิ์ในชมรม' },
  { value: 'history', label: 'ประวัติการเปลี่ยนแปลง' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const LOG_PAGE_SIZE = 30;

// สิทธิ์ในระบบ — permission role_permission:manage (ไม่ผูก role → super_admin) ซ่อนหน้าเพื่อ UX API ตรวจซ้ำ
export default async function PermissionAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('role_permission:manage')) redirect('/forbidden');
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === params.tab)?.value ?? 'permissions';
  const page = Math.max(1, Number(params.page) || 1);
  const [data, logs] = await Promise.all([
    apiGetJson<PermissionOverview>('/admin/permissions'),
    tab === 'history' ? apiGetJson<PermissionChangeLogPage>(`/admin/permission-change-logs?page=${page}`) : null,
  ]);
  const describe = new Map(data.permissions.map((p) => [p.code, p.descriptionTh]));
  const describeClub = new Map(data.clubPermissions.map((p) => [p.code, p.descriptionTh]));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="สิทธิ์ในระบบ"
        description="สิทธิ์แต่ละข้อทำอะไรได้ ผูกกับ role/ตำแหน่งใด และใครถืออยู่ — การแก้ไขมีผลทันทีและบันทึกประวัติทุกครั้ง (สิทธิ์ใหม่สร้างโดยนักพัฒนา)"
      />
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="หมวด">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/permissions${t.value === 'permissions' ? '' : `?tab=${t.value}`}`}
            aria-current={tab === t.value ? 'page' : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition ${
              tab === t.value ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.12] bg-white text-stone hover:border-matcha-300 hover:text-matcha-800'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'permissions' && (
        <div className="grid gap-3">
          <p className="rounded-bento border border-ink/[0.08] bg-cream px-5 py-4 text-sm text-ink">
            ผู้ดูแลระบบสูงสุด (super_admin) {data.superAdminCount} คน ผ่านทุกสิทธิ์โดยอัตโนมัติ ไม่นับรวมในจำนวนผู้ถือด้านล่าง
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.permissions.map((p) => (
              <li key={p.code} className="bento flex flex-col gap-2 p-5">
                <p className="font-mono text-[0.8125rem] break-all text-matcha-800">{p.code}</p>
                <p className="text-[0.9375rem] text-ink">{p.descriptionTh}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.roles.length === 0 ? (
                    <span className="text-sm text-stone">ยังไม่ผูก role (ใช้ได้เฉพาะ super_admin)</span>
                  ) : (
                    p.roles.map((r) => (
                      <Badge key={r.code} tone={r.isPrivileged ? 'kin' : 'matcha'}>
                        {r.nameTh}
                      </Badge>
                    ))
                  )}
                </div>
                <Link href={`/admin/permissions/${encodeURIComponent(p.code)}`} className="mt-auto text-sm text-matcha-700 underline underline-offset-4">
                  ผู้ถือสิทธิ์ {p.holderCount.toLocaleString('th-TH')} คน
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid gap-3">
          {data.roles.map((role) => {
            const fixed = role.code === 'super_admin';
            const auto = AUTO_ASSIGNED_ROLE_CODES.includes(role.code);
            const warning = [
              auto ? `role นี้ระบบให้ผู้ใช้อัตโนมัติตามประเภทบัญชี — มีผลกับผู้ใช้ ${role.activeHolderCount.toLocaleString('th-TH')} คน` : null,
              !auto && !role.isPrivileged ? 'role นี้ไม่ใช่สิทธิ์สูง ผู้มีสิทธิ์ให้ role (user_role:assign) จะแจก role นี้พร้อมสิทธิ์นี้ได้' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <details key={role.code} className="bento p-5">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{role.nameTh}</span>
                  <span className="font-mono text-xs text-stone">{role.code}</span>
                  {role.isSystem && <Badge tone="neutral">role ระบบ</Badge>}
                  {role.isPrivileged && <Badge tone="kin">สิทธิ์สูง</Badge>}
                  <span className="text-sm text-stone">
                    · {fixed ? 'ผ่านทุกสิทธิ์' : `${role.permissions.length} สิทธิ์`} · ผู้ถือ {role.activeHolderCount.toLocaleString('th-TH')} คน
                  </span>
                </summary>
                {role.description && <p className="mt-2 text-sm text-stone">{role.description}</p>}
                {fixed ? (
                  <p className="mt-3 text-sm text-stone">ผู้ดูแลระบบสูงสุดผ่านทุกสิทธิ์ในโค้ด จึงไม่ต้องผูกและแก้ไม่ได้</p>
                ) : (
                  <>
                    <ul className="mt-3 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
                      {data.permissions.map((p) => (
                        <BindingToggle
                          key={p.code}
                          label={p.code}
                          description={p.descriptionTh}
                          checked={role.permissions.includes(p.code)}
                          grantPath={`/admin/roles/${role.code}/permissions`}
                          grantBody={{ permissionCode: p.code }}
                          revokePath={`/admin/roles/${role.code}/permissions/${encodeURIComponent(p.code)}/revoke`}
                          warning={warning || undefined}
                        />
                      ))}
                    </ul>
                    <div className="mt-4 border-t border-ink/[0.06] pt-4">
                      <p className="mb-2 text-sm font-medium text-ink">แก้ข้อมูล role</p>
                      <RoleForm initial={role} />
                    </div>
                  </>
                )}
              </details>
            );
          })}
          <Bento>
            <BentoTitle className="mb-3">สร้าง role ใหม่</BentoTitle>
            <RoleForm />
          </Bento>
        </div>
      )}

      {tab === 'club' && (
        <div className="grid gap-3">
          <p className="rounded-bento border border-ink/[0.08] bg-cream px-5 py-4 text-sm text-ink">
            สิทธิ์ในชมรมได้จากตำแหน่งของผู้ใช้ในชมรมนั้น — การแก้มีผลกับผู้ดำรงตำแหน่งนี้ในทุกชมรม ส่วนชมรมที่ถูกระงับ/ยุบยังเหลือสิทธิ์อ่านอย่างเดียว
          </p>
          {data.clubPositions.map((position) => (
            <details key={position.code} className="bento p-5">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{position.nameTh}</span>
                <span className="font-mono text-xs text-stone">{position.code}</span>
                <span className="text-sm text-stone">· {position.permissions.length} สิทธิ์</span>
              </summary>
              <ul className="mt-3 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
                {data.clubPermissions.map((cp) => (
                  <BindingToggle
                    key={cp.code}
                    label={cp.code}
                    description={describeClub.get(cp.code) ?? ''}
                    checked={position.permissions.includes(cp.code)}
                    grantPath={`/admin/club-positions/${position.code}/permissions`}
                    grantBody={{ clubPermissionCode: cp.code }}
                    revokePath={`/admin/club-positions/${position.code}/permissions/${encodeURIComponent(cp.code)}/revoke`}
                    warning={`มีผลกับ${position.nameTh}ในทุกชมรม`}
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {tab === 'history' && logs && (
        <Bento>
          <BentoTitle className="mb-3">ประวัติการเปลี่ยนแปลง ({logs.total.toLocaleString('th-TH')})</BentoTitle>
          {logs.items.length === 0 ? (
            <p className="text-sm text-stone">ยังไม่มีการเปลี่ยนแปลง</p>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {logs.items.map((log) => (
                <li key={log.id} className="py-3 text-sm">
                  <p className="text-ink">
                    <span className="font-medium">{PERMISSION_LOG_ACTION_LABELS[log.action]}</span>{' '}
                    {log.roleNameTh ?? log.positionNameTh}
                    {(log.permissionCode ?? log.clubPermissionCode) && (
                      <>
                        {' '}— <span className="font-mono text-[0.8125rem]">{log.permissionCode ?? log.clubPermissionCode}</span>
                        <span className="text-stone"> ({describe.get(log.permissionCode ?? '') ?? describeClub.get(log.clubPermissionCode ?? '') ?? ''})</span>
                      </>
                    )}
                  </p>
                  <p className="text-stone">เหตุผล: {log.reason}</p>
                  <p className="text-xs text-stone">
                    {formatDateTime(log.createdAt)} โดย {log.actorName ?? '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {logs.total > LOG_PAGE_SIZE && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="เปลี่ยนหน้า">
              {page > 1 ? <Link href={`/admin/permissions?tab=history&page=${page - 1}`} className="btn btn-secondary">← ใหม่กว่า</Link> : <span />}
              <span className="text-stone">หน้า {page} / {Math.ceil(logs.total / LOG_PAGE_SIZE)}</span>
              {page * LOG_PAGE_SIZE < logs.total ? <Link href={`/admin/permissions?tab=history&page=${page + 1}`} className="btn btn-secondary">เก่ากว่า →</Link> : <span />}
            </nav>
          )}
        </Bento>
      )}
    </>
  );
}
