import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { NotificationList } from '@/components/notifications/NotificationList';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { NotificationPage } from '@/lib/notification-types';

const PAGE_SIZE = 20;

// การแจ้งเตือนในระบบของผู้ใช้ (ต้อง login เท่านั้น — API คืนเฉพาะของตัวเอง)
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await apiGetJson<NotificationPage>(`/me/notifications?page=${page}&pageSize=${PAGE_SIZE}`);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="การแจ้งเตือน"
        description={
          current.preferences.emailNotifications
            ? 'เรื่องที่เกี่ยวกับคุณในระบบ (ส่งทางอีเมลด้วย) เก็บไว้ 180 วัน'
            : 'เรื่องที่เกี่ยวกับคุณในระบบ เก็บไว้ 180 วัน — คุณปิดรับอีเมลแจ้งเตือนไว้ เปิดได้ที่หน้าการตั้งค่า'
        }
        actions={data.unread > 0 ? <ActionButton path="/me/notifications/read-all" label={`อ่านทั้งหมด (${data.unread})`} tone="neutral" /> : undefined}
      />

      {data.items.length === 0 ? (
        <EmptyState icon="bell" title="ยังไม่มีการแจ้งเตือน" description="เมื่อมีเรื่องที่เกี่ยวกับคุณ เช่น ถูกเสนอชื่อเป็นที่ปรึกษา หรือผลการพิจารณาคำขอ จะแสดงที่นี่" />
      ) : (
        <NotificationList items={data.items} />
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="เปลี่ยนหน้า">
          {page > 1 ? (
            <Link href={`/notifications?page=${page - 1}`} className="btn btn-secondary">
              ← ใหม่กว่า
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone">
            หน้า {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/notifications?page=${page + 1}`} className="btn btn-secondary">
              เก่ากว่า →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
