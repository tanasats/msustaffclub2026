import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BroadcastForm } from '@/components/broadcasts/BroadcastForm';
import { BroadcastHistory } from '@/components/broadcasts/BroadcastHistory';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { BroadcastPage, OrgUnitOption } from '@/lib/broadcast-types';

const PAGE_SIZE = 20;

// ส่งประกาศจากสโมสรบุคลากรถึงบุคลากร — permission staff_announcement:send (เจ้าหน้าที่สโมสร/นายกสโมสร) ซ่อนหน้าเพื่อ UX API ตรวจซ้ำ
export default async function StaffAnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('staff_announcement:send')) redirect('/forbidden');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [orgUnits, history] = await Promise.all([
    apiGetJson<{ items: OrgUnitOption[] }>('/staff-announcements/org-units'),
    apiGetJson<BroadcastPage>(`/staff-announcements?page=${page}`),
  ]);
  const totalPages = Math.max(1, Math.ceil(history.total / PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Announcements" title="ส่งประกาศถึงบุคลากร" description="ประกาศจากสโมสรบุคลากร แสดงที่กระดิ่งในระบบของผู้รับ และส่งทางอีเมลถึงผู้ที่เปิดรับ" />
      <div className="grid gap-3 sm:gap-4">
        <Bento>
          <BentoTitle className="mb-4">เขียนประกาศ</BentoTitle>
          <BroadcastForm mode="staff" orgUnits={orgUnits.items} />
        </Bento>
        <Bento>
          <BentoTitle className="mb-3">ประกาศที่ส่งแล้ว ({history.total.toLocaleString('th-TH')})</BentoTitle>
          <BroadcastHistory items={history.items} />
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="เปลี่ยนหน้า">
              {page > 1 ? <Link href={`/staff-announcements?page=${page - 1}`} className="btn btn-secondary">← ใหม่กว่า</Link> : <span />}
              <span className="text-stone">หน้า {page} / {totalPages}</span>
              {page < totalPages ? <Link href={`/staff-announcements?page=${page + 1}`} className="btn btn-secondary">เก่ากว่า →</Link> : <span />}
            </nav>
          )}
        </Bento>
      </div>
    </>
  );
}
