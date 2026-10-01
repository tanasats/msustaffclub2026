'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

// ผู้ยื่นลบคำขอที่ยกเลิกแล้วออกจากรายการ: กดครั้งแรกแสดงคำอธิบาย (ระบบยังเก็บข้อมูลไว้) กดยืนยันจึงลบ แล้วกลับไปหน้าคำขอของฉัน
export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await apiSend('POST', `/club-applications/${applicationId}/delete`);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'ลบไม่สำเร็จ');
      return;
    }
    router.push('/club-applications');
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-danger">
        ลบออกจากรายการ
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-labelledby="delete-title" className="grid w-full gap-3 rounded-xl border border-beni/30 bg-white p-4">
      <p id="delete-title" className="font-medium text-ink">ลบคำขอนี้ออกจากรายการของคุณ?</p>
      <p className="text-sm text-stone">
        คำขอจะไม่แสดงในรายการของคุณอีก แต่ระบบยังเก็บไว้เป็นหลักฐาน และผู้ดูแลระบบกู้คืนเป็นฉบับร่างได้
        หากต้องการให้ลบหรือทำลายข้อมูลส่วนบุคคล กรุณาติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (dpo@msu.ac.th)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={confirmDelete} disabled={pending} className="btn btn-danger">
          {pending ? 'กำลังลบ...' : 'ยืนยันลบออกจากรายการ'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-sm text-stone underline">
          ยกเลิก
        </button>
        {error && <span role="alert" className="text-sm text-beni">{error}</span>}
      </div>
    </div>
  );
}
