import { redirect } from 'next/navigation';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { CreateApplicationForm } from '@/components/club-applications/CreateApplicationForm';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ApplicationListItem } from '@/lib/club-application-types';

export default async function MyApplicationsPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  // แสดงฟอร์มตามสิทธิ์เพื่อ UX เท่านั้น (API ตรวจสิทธิ์จริง)
  const canCreate = current.roles.includes('super_admin') || current.permissions.includes('club_application:create');
  const [{ items }, nominations] = await Promise.all([
    apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/mine'),
    apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/president-nominations'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Club Establishment"
        title="คำขอจัดตั้งชมรม"
        description="บุคลากรทุกคนจัดทำคำขอได้ โดยเป็นประธานเองหรือเสนอบุคลากรอื่นเป็นประธาน (ผู้ถูกเสนอต้องตอบรับในระบบ) ต้องมีที่ปรึกษา 1–2 คน และสมาชิกตั้งต้นอย่างน้อย 5 คน (นับรวมกรรมการ)"
      />
      {nominations.items.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">คำขอที่เสนอชื่อคุณเป็นประธานชมรม</h2>
          <ApplicationList items={nominations.items} emptyMessage="" consentKind="president" />
        </section>
      )}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento tone="cream" className="lg:col-span-1">
          <BentoTitle className="mb-4">เริ่มคำขอใหม่</BentoTitle>
          {canCreate ? (
            <CreateApplicationForm />
          ) : (
            <p className="text-sm text-stone">เฉพาะบุคลากรเท่านั้นที่ยื่นคำขอจัดตั้งชมรมได้</p>
          )}
        </Bento>
        <div className="lg:col-span-2">
          <ApplicationList items={items} emptyMessage="ยังไม่มีคำขอ เริ่มจากตั้งชื่อชมรมที่ต้องการจัดตั้ง" />
        </div>
      </div>
    </>
  );
}
