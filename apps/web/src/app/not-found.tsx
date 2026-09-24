import Link from 'next/link';
import { PageMessage } from '@/components/PageMessage';

export default function NotFound() {
  return (
    <PageMessage title="ไม่พบหน้าที่ต้องการ">
      <Link href="/" className="text-blue-700 underline">
        กลับหน้าแรก
      </Link>
    </PageMessage>
  );
}
