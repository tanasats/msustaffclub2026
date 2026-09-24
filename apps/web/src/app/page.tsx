import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { ProfileCard } from '@/components/ProfileCard';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const current = await getCurrentUser();
  if (!current) {
    redirect('/login');
  }
  const { user, roles, profile, permissions } = current;
  // ซ่อน/แสดงเมนูเพื่อ UX เท่านั้น (API ตรวจสิทธิ์จริงทุกครั้ง)
  const has = (permission: string) => roles.includes('super_admin') || permissions.includes(permission);
  const canManageRoles = has('user_role:assign');
  const canApply = has('club_application:create');
  const canWorkQueue = has('club_application:review') || has('club_application:approve') || has('club:read_all');
  const isStaff = profile.type === 'staff';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">ระบบบริหารจัดการชมรมบุคลากร</h1>
          <p className="mt-1 text-slate-600">มหาวิทยาลัยมหาสารคาม</p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <p className="text-sm text-slate-600">เข้าสู่ระบบในชื่อ</p>
        <p className="mt-1 text-lg font-medium">{user.name ?? user.email}</p>
        <p className="text-sm text-slate-600">{user.email}</p>
        <p className="mt-3 text-sm text-slate-600">
          บทบาท: <span className="font-medium text-slate-900">{roles.join(', ') || '-'}</span>
        </p>
      </section>

      <ProfileCard profile={profile} />

      <nav className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">ชมรม</h2>
        <ul className="mt-2 grid gap-2">
          {canApply && (
            <li>
              <Link href="/club-applications" className="text-blue-700 underline">
                ยื่นคำขอจัดตั้งชมรม / คำขอของฉัน
              </Link>
            </li>
          )}
          {isStaff && (
            <li>
              <Link href="/club-applications/advisor-requests" className="text-blue-700 underline">
                คำขอที่เสนอชื่อฉันเป็นที่ปรึกษา
              </Link>
            </li>
          )}
          {canWorkQueue && (
            <li>
              <Link href="/club-applications/queue" className="text-blue-700 underline">
                คำขอที่รอตรวจ/อนุมัติ
              </Link>
            </li>
          )}
          {!canApply && !isStaff && !canWorkQueue && <li className="text-sm text-slate-600">ยังไม่มีเมนูสำหรับบัญชีของคุณ</li>}
        </ul>
      </nav>

      {canManageRoles && (
        <nav className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="font-semibold">ผู้ดูแลระบบ</h2>
          <Link href="/admin/users" className="mt-2 inline-block text-blue-700 underline">
            จัดการสิทธิ์ผู้ใช้
          </Link>
        </nav>
      )}
    </main>
  );
}
