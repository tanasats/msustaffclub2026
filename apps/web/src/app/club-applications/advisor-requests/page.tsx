import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationListItem } from '@/lib/club-application-types';

export default async function AdvisorRequestsPage() {
  const { items } = await apiGetJson<{ items: ApplicationListItem[] }>('/club-applications/advisor-requests');
  return (
    <>
      <PageHeader
        eyebrow="Advisor"
        title="งานที่ปรึกษาชมรม"
        description="คำขอที่เสนอชื่อคุณเป็นที่ปรึกษา เปิดเพื่ออ่านรายละเอียด แล้วกดยินยอมหรือปฏิเสธ"
      />
      <ApplicationList items={items} emptyMessage="ยังไม่มีคำขอที่เสนอชื่อคุณเป็นที่ปรึกษา" />
    </>
  );
}
