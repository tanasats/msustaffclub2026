'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { uploadFile } from '@/components/files/uploadFile';
import { Icon } from '@/components/ui/icons';
import { apiSend } from '@/lib/api-client';

// ต้องตรงกับนโยบายไฟล์ club_logo ของ API (ไม่รับ SVG)
const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 2 * 1024 * 1024;

interface LogoUploaderProps {
  // endpoint สำหรับผูกไฟล์ เช่น /clubs/{id}/logo หรือ /club-applications/{id}/logo
  attachPath: string;
  hasLogo: boolean;
}

// อัปโหลด/เปลี่ยน/เอาตราออก (ตรวจชนิด/ขนาดก่อนเพื่อ UX, API ตรวจซ้ำ)
export function LogoUploader({ attachPath, hasLogo }: LogoUploaderProps) {
  const router = useRouter();
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach(fileId: string | null) {
    const result = await apiSend('PUT', attachPath, { fileId });
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกตราไม่สำเร็จ');
      return;
    }
    router.refresh();
  }

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('รองรับเฉพาะไฟล์ PNG, JPG, WebP');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('ไฟล์ใหญ่เกิน 2 MB');
      return;
    }
    setPending(true);
    const uploaded = await uploadFile(file, 'club_logo');
    if (uploaded.ok) {
      await attach(uploaded.fileId);
    } else {
      setError(uploaded.message);
    }
    setPending(false);
  }

  async function remove() {
    setPending(true);
    setError(null);
    await attach(null);
    setPending(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className={`btn btn-secondary !min-h-10 cursor-pointer text-sm ${pending ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="plus" className="size-4" />
        {pending ? 'กำลังบันทึก...' : hasLogo ? 'เปลี่ยนตรา' : 'อัปโหลดตรา'}
      </label>
      <input id={inputId} type="file" accept={ACCEPT} onChange={handleChange} className="sr-only" data-testid="logo-input" />
      {hasLogo && (
        <button type="button" onClick={remove} disabled={pending} className="btn btn-ghost !min-h-10 text-sm">
          เอาตราออก
        </button>
      )}
      <span className="text-xs text-mist">PNG / JPG / WebP ไม่เกิน 2 MB</span>
      {error && (
        <span role="alert" className="w-full text-sm text-beni">
          {error}
        </span>
      )}
    </div>
  );
}
