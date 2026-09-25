import Link from 'next/link';
import { PageMessage } from '@/components/PageMessage';
import { buttonClass } from '@/components/ui/button';

export default function NotFound() {
  return (
    <PageMessage title="ไม่พบหน้าที่ต้องการ" description="หน้านี้อาจถูกย้าย หรือคุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้">
      <Link href="/" className={buttonClass('secondary')}>
        กลับหน้าหลัก
      </Link>
    </PageMessage>
  );
}
