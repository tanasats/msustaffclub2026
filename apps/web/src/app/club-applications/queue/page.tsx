import Link from 'next/link';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationListItem } from '@/lib/club-application-types';

// กล่องงานเจ้าหน้าที่สโมสร/นายกสโมสร (API เลือกสถานะตามสิทธิ์ของผู้ใช้ และตอบ 403 ถ้าไม่มีสิทธิ์)
export default async function QueuePage() {
  const { items } = await apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/queue');
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← หน้าแรก
      </Link>
      <h1 className="mt-2 text-2xl font-bold">คำขอที่รอดำเนินการ</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">เรียงจากคำขอที่ยื่นก่อน</p>
      <ApplicationList items={items} emptyMessage="ไม่มีคำขอที่รอดำเนินการ" />
    </main>
  );
}
