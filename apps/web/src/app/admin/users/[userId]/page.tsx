import Link from 'next/link';
import { AccountStatusForm } from '@/components/admin/AccountStatusForm';
import { ProvisionUserForm, type ProvisionValues } from '@/components/admin/ProvisionUserForm';
import { GrantRoleForm } from '@/components/admin/GrantRoleForm';
import { RevokeRoleButton } from '@/components/admin/RevokeRoleButton';
import { RoleBadge } from '@/components/RoleBadge';
import { Avatar } from '@/components/ui/Avatar';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, apiGetJson } from '@/lib/api-server';
import { ACCOUNT_EVENT_LABELS, type AccountOverview, type AdminRole, type AdminUserOverview } from '@/lib/admin-types';
import { getCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { ERP_RESULT_LABELS, type MyData } from '@/lib/my-data-types';

// ข้อมูลที่กรอกของบัญชีที่ยังไม่ผูก (null = ผูกแล้ว/ไม่ใช่บัญชีที่เพิ่มล่วงหน้า — API ตอบ 404)
async function loadProvisioned(userId: string): Promise<{ values: ProvisionValues; orgUnits: { id: string; code: string; nameTh: string }[] } | null> {
  const res = await apiFetch(`/provisioned-users/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`โหลดข้อมูลบัญชีไม่สำเร็จ (${res.status})`);
  const p = (await res.json()) as Record<string, string | null>;
  const orgUnits = await apiGetJson<{ items: { id: string; code: string; nameTh: string }[] }>('/provisioning/org-units');
  const v = (key: string) => p[key] ?? '';
  return {
    orgUnits: orgUnits.items,
    values: {
      email: v('email'),
      prefixNameTh: v('prefixNameTh'),
      firstNameTh: v('firstNameTh'),
      lastNameTh: v('lastNameTh'),
      prefixNameEn: v('prefixNameEn'),
      firstNameEn: v('firstNameEn'),
      lastNameEn: v('lastNameEn'),
      orgUnitId: v('orgUnitId'),
      positionNameTh: v('positionNameTh'),
    },
  };
}

type OrgUnitOption = { id: string; code: string; nameTh: string };

// ข้อมูลบุคลากรสำหรับฟอร์ม "บันทึกแทน ERP" — แสดงเฉพาะบัญชีบุคลากรที่ยังไม่มีข้อมูลจาก ERP (API บอกด้วย editable)
async function loadManualProfile(userId: string): Promise<{ values: ProvisionValues; orgUnits: OrgUnitOption[]; hasProfile: boolean } | null> {
  const data = await apiGetJson<{ editable: boolean; profile: Record<string, string | null> }>(`/user-accounts/${encodeURIComponent(userId)}/staff-profile`);
  if (!data.editable) return null;
  const orgUnits = await apiGetJson<{ items: OrgUnitOption[] }>('/provisioning/org-units');
  const v = (key: string) => data.profile[key] ?? '';
  return {
    orgUnits: orgUnits.items,
    hasProfile: data.profile.source === 'admin',
    values: {
      email: v('email'),
      prefixNameTh: v('prefixNameTh'),
      firstNameTh: v('firstNameTh'),
      lastNameTh: v('lastNameTh'),
      prefixNameEn: v('prefixNameEn'),
      firstNameEn: v('firstNameEn'),
      lastNameEn: v('lastNameEn'),
      orgUnitId: v('orgUnitId'),
      positionNameTh: v('positionNameTh'),
    },
  };
}

function SummaryRow({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="py-2.5">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] break-words text-ink">{value || '—'}</dd>
      {note && <dd className="mt-0.5 text-sm text-kin">{note}</dd>}
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [overview, roles, current] = await Promise.all([
    apiGetJson<AdminUserOverview>(`/admin/users/${encodeURIComponent(userId)}`),
    apiGetJson<{ items: AdminRole[] }>('/admin/roles'),
    getCurrentUser(),
  ]);
  const { user, history } = overview;
  // ปิด/เปิดบัญชี: permission user_account:deactivate (ไม่ผูก role → super_admin) — เมนูเพื่อ UX เท่านั้น API ตรวจซ้ำ
  const canManageAccount = Boolean(current && (current.roles.includes('super_admin') || current.permissions.includes('user_account:deactivate')));
  const account = canManageAccount ? await apiGetJson<AccountOverview>(`/user-accounts/${encodeURIComponent(userId)}`) : null;
  // บัญชีที่เพิ่มล่วงหน้าและยังไม่ผูก: แก้ข้อมูลได้ (permission user_account:create) — บัญชีที่ผูกแล้ว API ตอบ 404 จึงไม่แสดง
  const canProvision = Boolean(current && (current.roles.includes('super_admin') || current.permissions.includes('user_account:create')));
  const provisioned = canProvision ? await loadProvisioned(userId) : null;
  // บัญชีที่เข้าระบบแล้วแต่ ERP ไม่มีข้อมูล: บันทึกชื่อ/หน่วยงานแทน ERP ได้ (permission เดียวกัน)
  const manual = canProvision && !provisioned ? await loadManualProfile(userId) : null;
  // ข้อมูลบัญชีแบบเต็ม (Google, ERP, การเข้าระบบ): permission user_account:inspect (ไม่ผูก role → super_admin)
  const canInspect = Boolean(current && (current.roles.includes('super_admin') || current.permissions.includes('user_account:inspect')));
  const data = canInspect ? await apiGetJson<MyData>(`/user-accounts/${encodeURIComponent(userId)}/data`) : null;
  const lastErp = data?.loginEvents.find((e) => e.erpResult !== null) ?? null;
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

      {data && (
        <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-serif text-lg font-medium">ข้อมูลบัญชี</h2>
            <Link href={`/admin/users/${user.id}/data`} className="btn btn-secondary !min-h-10 text-sm">
              ดูข้อมูลทั้งหมด
            </Link>
          </div>
          <div className="mt-2 grid gap-x-8 sm:grid-cols-3">
            <div>
              <p className="pb-1 text-xs font-medium tracking-wide text-matcha-700">จาก Google</p>
              <dl className="divide-y divide-ink/[0.06]">
                <SummaryRow
                  label="ชื่อในบัญชี Google"
                  value={
                    <span className="flex items-center gap-2">
                      <Avatar name={data.account.googleName} email={data.account.email} pictureUrl={data.account.pictureUrl} size="sm" />
                      {data.account.googleName ?? '—'}
                    </span>
                  }
                />
                <SummaryRow label="บัญชี Google" value={data.account.hasLinkedGoogle ? 'ผูกแล้ว' : 'ยังไม่ผูก (ยังไม่เคยเข้าสู่ระบบ)'} />
                <SummaryRow label="อีเมล" value={data.account.email} />
              </dl>
            </div>
            <div>
              <p className="pb-1 text-xs font-medium tracking-wide text-matcha-700">จาก ERP-HR</p>
              <dl className="divide-y divide-ink/[0.06]">
                <SummaryRow
                  label="ข้อมูลบุคลากร"
                  value={
                    data.staffProfile
                      ? `${data.staffProfile.source === 'erp' ? 'จาก ERP' : 'ผู้ดูแลบันทึกแทน ERP'} · ${formatDateTime(data.staffProfile.syncedAt)}`
                      : data.studentProfile
                        ? 'บัญชีนิสิต (ไม่ใช้ ERP)'
                        : 'ยังไม่มีข้อมูล'
                  }
                />
                <SummaryRow label="รหัสบุคลากร" value={data.staffProfile?.staffCode} />
                <SummaryRow
                  label="การดึงข้อมูล ERP ครั้งล่าสุด"
                  value={lastErp ? formatDateTime(lastErp.loggedInAt) : 'ไม่มีบันทึก (180 วันล่าสุด)'}
                  note={lastErp && lastErp.erpResult !== 'ok' ? ERP_RESULT_LABELS[lastErp.erpResult!] : undefined}
                />
              </dl>
            </div>
            <div>
              <p className="pb-1 text-xs font-medium tracking-wide text-matcha-700">การใช้งาน</p>
              <dl className="divide-y divide-ink/[0.06]">
                <SummaryRow label="เข้าสู่ระบบล่าสุด" value={formatDateTime(data.account.lastLoginAt)} />
                <SummaryRow label="เข้าสู่ระบบ 180 วันล่าสุด" value={`${data.loginEvents.length.toLocaleString('th-TH')}${data.loginEvents.length >= 50 ? '+' : ''} ครั้ง`} />
                <SummaryRow label="อุปกรณ์ที่ยังเข้าสู่ระบบอยู่" value={`${data.sessions.active} อุปกรณ์`} />
              </dl>
            </div>
          </div>
        </section>
      )}

      {manual && (
        <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
          <h2 className="font-serif text-lg font-medium">บันทึกข้อมูลบุคลากรแทน ERP</h2>
          <p className="mt-1 mb-4 text-sm text-stone">
            {manual.hasProfile
              ? 'ข้อมูลนี้ผู้ดูแลระบบบันทึกไว้แทน ERP แก้ไขได้จนกว่า ERP จะมีข้อมูล'
              : 'บัญชีนี้ยังไม่มีข้อมูลจาก ERP (เช่น ERP ไม่ได้บันทึกอีเมลของบุคลากร) จึงแสดงชื่อจาก Google และไม่ทราบหน่วยงาน'}{' '}
            — ระบบจะใช้ข้อมูลจาก ERP แทนอัตโนมัติเมื่อเจ้าตัวเข้าสู่ระบบและ ERP มีข้อมูลแล้ว
          </p>
          <ProvisionUserForm mode="manual" orgUnits={manual.orgUnits} userId={user.id} initial={manual.values} />
        </section>
      )}

      {provisioned && (
        <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
          <h2 className="font-serif text-lg font-medium">ข้อมูลบุคลากร (เพิ่มล่วงหน้า ยังไม่เคยเข้าระบบ)</h2>
          <p className="mt-1 mb-4 text-sm text-stone">แก้ไขได้จนกว่าเจ้าตัวจะเข้าสู่ระบบ หลังจากนั้นข้อมูลจะเป็นไปตาม ERP</p>
          <ProvisionUserForm orgUnits={provisioned.orgUnits} userId={user.id} initial={provisioned.values} />
        </section>
      )}

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

      {account && (
        <section className="mt-3 bento p-5 sm:mt-4 sm:p-6">
          <h2 className="font-serif text-lg font-medium">สถานะบัญชี</h2>
          {user.isActive ? (
            <>
              <p className="mt-1 text-sm text-stone">
                ใช้เมื่อบุคลากรพ้นจากมหาวิทยาลัย (ระเบียบชมรมข้อ 20(2)): ปิดบัญชีและออกจากระบบทันที แล้วระบบให้พ้นสภาพในทุกชมรมพร้อมกัน
              </p>
              {isSelf ? (
                <p className="mt-2 text-sm text-kin">ปิดบัญชีของตนเองไม่ได้</p>
              ) : (
                <>
                  <ul className="mt-3 grid gap-1 text-sm">
                    <li>
                      สมาชิกภาพ/ใบสมัคร/คำเชิญที่จะสิ้นสุด: {account.effects.memberships.length === 0 ? 'ไม่มี' : account.effects.memberships.map((m) => m.clubName).join(', ')}
                    </li>
                    <li>
                      ตำแหน่งกรรมการที่จะสิ้นสุด:{' '}
                      {account.effects.committee.length === 0 ? 'ไม่มี' : account.effects.committee.map((c) => `${c.positionTitle} ${c.clubName}`).join(', ')}
                    </li>
                    <li>
                      การเป็นที่ปรึกษาที่จะสิ้นสุด: {account.effects.advisorships.length === 0 ? 'ไม่มี' : account.effects.advisorships.map((a) => a.clubName).join(', ')}
                    </li>
                  </ul>
                  {account.effects.committee.some((c) => c.isPresident) && (
                    <p className="mt-3 rounded-xl border border-kin/20 bg-kin-50 px-3 py-2 text-sm text-kin">
                      ชมรมต่อไปนี้จะไม่มีประธาน — ผู้ดูแลระบบโอนตำแหน่งประธานให้สมาชิกคนอื่นได้ที่หน้าชมรม:{' '}
                      {account.effects.committee
                        .filter((c) => c.isPresident)
                        .map((c, i) => (
                          <span key={c.id}>
                            {i > 0 && ', '}
                            <Link href={`/clubs/${c.clubId}`} className="underline">
                              {c.clubName}
                            </Link>
                          </span>
                        ))}
                    </p>
                  )}
                  <div className="mt-4">
                    <AccountStatusForm userId={user.id} mode="deactivate" />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-stone">บัญชีนี้ถูกปิดอยู่ เปิดคืนแล้วเข้าสู่ระบบได้อีก แต่สมาชิกภาพและตำแหน่งที่สิ้นสุดไปแล้วไม่คืนอัตโนมัติ</p>
              <div className="mt-4">
                <AccountStatusForm userId={user.id} mode="reactivate" />
              </div>
            </>
          )}
          {account.history.length > 0 && (
            <ul className="mt-4 divide-y divide-ink/[0.06] border-t border-ink/[0.08] text-sm">
              {account.history.map((h, i) => (
                <li key={i} className="py-2">
                  <span className={h.action === 'deactivated' ? 'text-beni' : 'text-matcha-700'}>{ACCOUNT_EVENT_LABELS[h.action]}</span> — {h.reason}
                  <p className="text-xs text-mist">
                    {formatDateTime(h.createdAt)} โดย {h.actorName ?? 'ระบบ'}
                    {h.action === 'deactivated' &&
                      ` · พ้นสภาพสมาชิก ${h.effects.membershipsEnded ?? 0} · ยกเลิกใบสมัคร/คำเชิญ ${h.effects.applicationsWithdrawn ?? 0} · พ้นตำแหน่งกรรมการ ${h.effects.committeePositionsEnded ?? 0} · สิ้นสุดที่ปรึกษา ${h.effects.advisorshipsEnded ?? 0}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
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
