import Link from 'next/link';
import { DownloadMyDataButton } from '@/components/privacy/DownloadMyDataButton';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { UserDataView } from '@/components/user-data/UserDataView';
import { apiGetJson } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';
import type { MyData } from '@/lib/my-data-types';

// ข้อมูลของฉัน (ต้อง login เท่านั้น — API คืนเฉพาะข้อมูลของผู้ใช้เอง): สิทธิขอเข้าถึง/รับสำเนา ตาม PDPA
export default async function MyDataPage() {
  const d = await apiGetJson<MyData>('/me/data');

  return (
    <>
      <PageHeader
        eyebrow="My data"
        title="ข้อมูลของฉัน"
        description="ข้อมูลส่วนบุคคลของคุณทั้งหมดที่ระบบเก็บไว้ แยกตามกลุ่ม พร้อมแหล่งที่มาและวิธีแก้ไข"
        back={{ href: '/settings', label: 'การตั้งค่า' }}
      />

      <div className="grid gap-3 sm:gap-4">
        <Bento tone="cream">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm leading-relaxed text-ink">
              <p>
                ข้อมูล ณ {formatDateTime(d.generatedAt)} · ดาวน์โหลดเป็นไฟล์เพื่อเก็บสำเนาหรือนำไปใช้ต่อได้
              </p>
              <p className="mt-2">
                ต้องการขอแก้ไข ลบ ระงับ หรือคัดค้านการประมวลผล ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ของมหาวิทยาลัย:{' '}
                <a href="mailto:dpo@msu.ac.th" className="text-matcha-700 underline underline-offset-4">
                  dpo@msu.ac.th
                </a>{' '}
                โทร 0-4371-9800 ต่อ 2344 ·{' '}
                <Link href="/privacy" className="text-matcha-700 underline underline-offset-4">
                  ประกาศความเป็นส่วนตัว
                </Link>
              </p>
            </div>
            <div className="shrink-0">
              <DownloadMyDataButton />
            </div>
          </div>
        </Bento>

        <UserDataView data={d} viewer="self" />
      </div>
    </>
  );
}
