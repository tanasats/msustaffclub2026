import Link from 'next/link';
import { PageMessage } from '@/components/PageMessage';
import { buttonClass } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <PageMessage title="ไม่มีสิทธิ์เข้าถึง" description="บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ">
      <Link href="/" className={buttonClass('secondary')}>
        กลับหน้าหลัก
      </Link>
    </PageMessage>
  );
}
