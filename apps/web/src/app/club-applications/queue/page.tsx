import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationListItem } from '@/lib/club-application-types';

// กล่องงานเจ้าหน้าที่สโมสร/นายกสโมสร (API เลือกสถานะตามสิทธิ์ของผู้ใช้ และตอบ 403 ถ้าไม่มีสิทธิ์)
export default async function QueuePage() {
  const { items } = await apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/queue');
  return (
    <>
      <PageHeader eyebrow="Review" title="ตรวจและอนุมัติคำขอ" description="เรียงจากคำขอที่ยื่นก่อน" />
      <ApplicationList items={items} emptyMessage="ไม่มีคำขอที่รอดำเนินการ" />
    </>
  );
}
