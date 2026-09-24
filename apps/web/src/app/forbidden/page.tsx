import Link from 'next/link';
import { PageMessage } from '@/components/PageMessage';

export default function ForbiddenPage() {
  return (
    <PageMessage title="ไม่มีสิทธิ์เข้าถึง" description="บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ">
      <Link href="/" className="text-blue-700 underline">
        กลับหน้าแรก
      </Link>
    </PageMessage>
  );
}
