import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { ProfileCard } from '@/components/ProfileCard';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const current = await getCurrentUser();
  if (!current) {
    redirect('/login');
  }
  const { user, roles, profile } = current;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">ระบบจัดการชมรมกีฬาบุคลากร</h1>
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
    </main>
  );
}
