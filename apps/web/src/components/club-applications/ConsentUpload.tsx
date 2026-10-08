'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { uploadFile } from '@/components/files/uploadFile';
import { Icon } from '@/components/ui/icons';
import { apiSend } from '@/lib/api-client';

const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;

// แนบเอกสารคำยินยอม/ใบตอบรับที่ลงนามแล้ว (PDF/JPG/PNG ไม่เกิน 10 MB)
// ค่าตั้งต้น = ใบคำยินยอมของที่ปรึกษาลำดับ sortOrder, kind=president = ใบตอบรับของผู้ถูกเสนอเป็นประธาน
export function ConsentUpload({
  applicationId,
  sortOrder = 0,
  hasFile,
  kind = 'advisor',
}: {
  applicationId: string;
  sortOrder?: number;
  hasFile: boolean;
  kind?: 'advisor' | 'president';
}) {
  const attachPath =
    kind === 'president'
      ? `/club-applications/${applicationId}/president-consent-file`
      : `/club-applications/${applicationId}/advisors/${sortOrder}/consent-file`;
  const noun = kind === 'president' ? 'ใบตอบรับ' : 'ใบคำยินยอม';
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
    const attached = await apiSend('PUT', attachPath, {
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
        {status === 'uploading' ? 'กำลังอัปโหลด...' : hasFile ? `เปลี่ยนไฟล์${noun}` : `แนบ${noun}ที่ลงนามแล้ว`}
      </label>
      <input id={inputId} type="file" accept={ACCEPT} onChange={handleChange} className="sr-only" data-testid={kind === 'president' ? 'consent-input-president' : `consent-input-${sortOrder}`} />
      <span className="text-xs text-mist">PDF / JPG / PNG ไม่เกิน 10 MB</span>
      {status === 'error' && (
        <span role="alert" className="w-full text-sm text-beni">
          {message}
        </span>
      )}
    </div>
  );
}
