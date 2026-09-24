import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { CreateApplicationForm } from '@/components/club-applications/CreateApplicationForm';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ApplicationListItem } from '@/lib/club-application-types';

export default async function MyApplicationsPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  // แสดงฟอร์มตามสิทธิ์เพื่อ UX เท่านั้น (API ตรวจสิทธิ์จริง)
  const canCreate =
    current.roles.includes('super_admin') || current.permissions.includes('club_application:create');
  const { items } = await apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/mine');

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← หน้าแรก
      </Link>
      <h1 className="mt-2 text-2xl font-bold">คำขอจัดตั้งชมรมของฉัน</h1>

      {canCreate ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-3 font-semibold">ยื่นคำขอจัดตั้งชมรมใหม่</h2>
          <p className="mb-3 text-sm text-slate-600">
            ผู้ยื่นคำขอจะเป็นประธานชมรม ต้องมีที่ปรึกษา 1–2 คน และสมาชิกตั้งต้นอย่างน้อย 5 คน (นับรวมกรรมการ)
          </p>
          <CreateApplicationForm />
        </section>
      ) : (
        <p className="mt-6 text-sm text-slate-600">เฉพาะบุคลากรเท่านั้นที่ยื่นคำขอจัดตั้งชมรมได้</p>
      )}

      <h2 className="mb-3 mt-8 font-semibold">คำขอที่ยื่นไว้</h2>
      <ApplicationList items={items} emptyMessage="ยังไม่มีคำขอ" />
    </main>
  );
}
