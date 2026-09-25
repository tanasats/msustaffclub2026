'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { uploadFile } from '@/components/files/uploadFile';
import { Icon } from '@/components/ui/icons';
import { apiSend } from '@/lib/api-client';

const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;

// แนบใบคำยินยอมที่ลงนามแล้วของที่ปรึกษาภายนอก (PDF/JPG/PNG ไม่เกิน 10 MB)
export function ConsentUpload({ applicationId, sortOrder, hasFile }: { applicationId: string; sortOrder: number; hasFile: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setStatus('error');
      setMessage('รองรับเฉพาะไฟล์ PDF, JPG, PNG');
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus('error');
      setMessage('ไฟล์ใหญ่เกิน 10 MB');
      return;
    }
    setStatus('uploading');
    const uploaded = await uploadFile(file, 'advisor_consent');
    if (!uploaded.ok) {
      setStatus('error');
      setMessage(uploaded.message);
      return;
    }
    const attached = await apiSend('PUT', `/club-applications/${applicationId}/advisors/${sortOrder}/consent-file`, {
      fileId: uploaded.fileId,
    });
    if (!attached.ok) {
      setStatus('error');
      setMessage(attached.errorMessage ?? 'แนบไฟล์ไม่สำเร็จ');
      return;
    }
    setStatus('idle');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className={`btn btn-secondary !min-h-10 cursor-pointer text-sm ${status === 'uploading' ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="plus" className="size-4" />
        {status === 'uploading' ? 'กำลังอัปโหลด...' : hasFile ? 'เปลี่ยนไฟล์คำยินยอม' : 'แนบใบคำยินยอมที่ลงนามแล้ว'}
      </label>
      <input id={inputId} type="file" accept={ACCEPT} onChange={handleChange} className="sr-only" data-testid={`consent-input-${sortOrder}`} />
      <span className="text-xs text-mist">PDF / JPG / PNG ไม่เกิน 10 MB</span>
      {status === 'error' && (
        <span role="alert" className="w-full text-sm text-beni">
          {message}
        </span>
      )}
    </div>
  );
}
