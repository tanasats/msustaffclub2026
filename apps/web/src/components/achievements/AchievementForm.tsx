'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { uploadFile } from '@/components/files/uploadFile';
import { Icon } from '@/components/ui/icons';
import {
  CATEGORY_OPTIONS,
  LEVEL_OPTIONS,
  type AchievementCategory,
  type AchievementDetail,
  type AchievementFile,
  type AchievementLevel,
} from '@/lib/achievement-types';
import { apiSend } from '@/lib/api-client';

// ต้องตรงกับนโยบายไฟล์ achievement_evidence และ MAX_ACHIEVEMENT_FILES ของ API
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

interface AchievementFormProps {
  // บันทึกใหม่ในชมรมนี้ หรือแก้ไขผลงานเดิม
  mode: { kind: 'create'; clubId: string } | { kind: 'edit'; achievement: AchievementDetail };
  // วันนี้ตามเวลาประเทศไทย (YYYY-MM-DD) ใช้จำกัดวันที่ในฟอร์ม
  today: string;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-mist">{hint}</span>}
    </label>
  );
}

export function AchievementForm({ mode, today }: AchievementFormProps) {
  const router = useRouter();
  const fileInputId = useId();
  const initial = mode.kind === 'edit' ? mode.achievement : null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [achievedOn, setAchievedOn] = useState(initial?.achievedOn ?? '');
  const [level, setLevel] = useState<AchievementLevel>(initial?.level ?? 'university');
  const [category, setCategory] = useState<AchievementCategory>(initial?.category ?? 'competition');
  const [award, setAward] = useState(initial?.award ?? '');
  const [organizer, setOrganizer] = useState(initial?.organizer ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [files, setFiles] = useState<AchievementFile[]>(initial?.files ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setError(null);
    if (files.length + picked.length > MAX_FILES) {
      setError(`แนบไฟล์ได้ไม่เกิน ${MAX_FILES} ไฟล์`);
      return;
    }
    const invalid = picked.find((file) => !ACCEPT.split(',').includes(file.type) || file.size > MAX_BYTES);
    if (invalid) {
      setError(`ไฟล์ ${invalid.name} ไม่รองรับ (PDF, JPG, PNG ไม่เกิน 10 MB)`);
      return;
    }
    setUploading(true);
    for (const file of picked) {
      const result = await uploadFile(file, 'achievement_evidence');
      if (!result.ok) {
        setError(`${file.name}: ${result.message}`);
        break;
      }
      setFiles((current) => [...current, { fileId: result.fileId, originalName: file.name, mimeType: file.type, sizeBytes: file.size }]);
    }
    setUploading(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      title,
      achievedOn,
      level,
      category,
      award: award || null,
      organizer: organizer || null,
      description: description || null,
      fileIds: files.map((file) => file.fileId),
    };
    const result =
      mode.kind === 'create'
        ? await apiSend('POST', `/clubs/${mode.clubId}/achievements`, body)
        : await apiSend('PUT', `/achievements/${mode.achievement.id}`, body);
    setSaving(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    const id = mode.kind === 'create' ? (result.data as { id: string }).id : mode.achievement.id;
    router.push(`/achievements/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="ชื่อผลงาน *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} placeholder="เช่น การประกวดดนตรีไทยระดับประเทศ" className="field" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="วันที่ได้รับ *">
          <input type="date" value={achievedOn} onChange={(e) => setAchievedOn(e.target.value)} required max={today} className="field" />
        </Field>
        <Field label="ระดับ *">
          <select value={level} onChange={(e) => setLevel(e.target.value as AchievementLevel)} className="field">
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ประเภท *">
          <select value={category} onChange={(e) => setCategory(e.target.value as AchievementCategory)} className="field">
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="ผลที่ได้รับ">
          <input value={award} onChange={(e) => setAward(e.target.value)} maxLength={200} placeholder="เช่น รางวัลชนะเลิศ, เหรียญเงิน" className="field" />
        </Field>
        <Field label="ผู้จัด / หน่วยงานที่มอบ">
          <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} maxLength={300} className="field" />
        </Field>
      </div>
      <Field label="รายละเอียด">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} className="field" />
      </Field>

      <div className="grid gap-2">
        <span className="text-sm font-medium">หลักฐาน (เกียรติบัตร / รูปภาพ)</span>
        {files.length > 0 && (
          <ul className="grid gap-1.5">
            {files.map((file) => (
              <li key={file.fileId} className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.08] px-3 py-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Icon name="scroll" className="size-4 shrink-0 text-stone" />
                  <span className="truncate">{file.originalName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((f) => f.fileId !== file.fileId))}
                  className="shrink-0 text-xs text-beni underline"
                >
                  เอาออก
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_FILES && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={fileInputId} className={`btn btn-secondary !min-h-10 cursor-pointer text-sm ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              <Icon name="plus" className="size-4" />
              {uploading ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
            </label>
            <input id={fileInputId} type="file" accept={ACCEPT} multiple onChange={handleFiles} className="sr-only" data-testid="evidence-input" />
            <span className="text-xs text-mist">PDF / JPG / PNG ไม่เกิน 10 MB สูงสุด {MAX_FILES} ไฟล์</span>
          </div>
        )}
        <p className="text-xs text-mist">ไฟล์แนบเห็นเฉพาะคุณ กรรมการชมรม และเจ้าหน้าที่</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-beni">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || uploading} className="btn btn-primary">
          {saving ? 'กำลังบันทึก...' : mode.kind === 'create' ? 'ส่งให้กรรมการรับรอง' : initial?.status === 'returned' ? 'บันทึกและส่งใหม่' : 'บันทึกการแก้ไข'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
