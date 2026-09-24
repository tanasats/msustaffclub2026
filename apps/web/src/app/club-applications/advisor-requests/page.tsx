import Link from 'next/link';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationListItem } from '@/lib/club-application-types';

export default async function AdvisorRequestsPage() {
  const { items } = await apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/advisor-requests');
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← หน้าแรก
      </Link>
      <h1 className="mt-2 text-2xl font-bold">คำขอที่เสนอชื่อฉันเป็นที่ปรึกษา</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">เปิดคำขอเพื่ออ่านรายละเอียด แล้วกดยินยอมหรือปฏิเสธ</p>
      <ApplicationList items={items} emptyMessage="ไม่มีคำขอที่เสนอชื่อคุณเป็นที่ปรึกษา" />
    </main>
  );
}
