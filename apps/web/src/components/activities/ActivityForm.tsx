'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { uploadFile } from '@/components/files/uploadFile';
import { Icon } from '@/components/ui/icons';
import type { ActivityDetail, PlannedActivity } from '@/lib/activity-types';
import { apiSend } from '@/lib/api-client';

// ต้องตรงกับนโยบายไฟล์ activity_photo และ MAX_ACTIVITY_PHOTOS ของ API
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 10;

interface ActivityFormProps {
  clubId: string;
  // บันทึกใหม่ หรือแก้ไขกิจกรรมเดิม
  activity: ActivityDetail | null;
  plans: PlannedActivity[];
  // สมาชิก active ของชมรม (ให้เลือกผู้เข้าร่วม)
  members: { userId: string; name: string }[];
  today: string;
}

interface Photo {
  fileId: string;
  originalName: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function ActivityForm({ clubId, activity, plans, members, today }: ActivityFormProps) {
  const router = useRouter();
  const photoInputId = useId();
  const [plannedActivityId, setPlannedActivityId] = useState(activity?.plannedActivityId ?? '');
  const [heldOn, setHeldOn] = useState(activity?.heldOn ?? today);
  const [timeText, setTimeText] = useState(activity?.timeText ?? '');
  const [title, setTitle] = useState(activity?.title ?? '');
  const [location, setLocation] = useState(activity?.location ?? '');
  const [summary, setSummary] = useState(activity?.summary ?? '');
  const [participants, setParticipants] = useState<Set<string>>(new Set(activity?.participants?.map((p) => p.userId) ?? []));
  const [participantCount, setParticipantCount] = useState(activity?.participantCount?.toString() ?? '');
  const [photos, setPhotos] = useState<Photo[]>(activity?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เลือกแผน → เติมชื่อกิจกรรมให้ถ้ายังว่าง
  function choosePlan(id: string) {
    setPlannedActivityId(id);
    const plan = plans.find((p) => p.id === id);
    if (plan && !title.trim()) setTitle(plan.title);
  }

  function toggle(userId: string) {
    setParticipants((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handlePhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setError(null);
    if (photos.length + picked.length > MAX_PHOTOS) {
      setError(`แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
      return;
    }
    const invalid = picked.find((file) => !ACCEPT.split(',').includes(file.type) || file.size > MAX_BYTES);
    if (invalid) {
      setError(`ไฟล์ ${invalid.name} ไม่รองรับ (JPG, PNG, WebP ไม่เกิน 10 MB)`);
      return;
    }
    setUploading(true);
    for (const file of picked) {
      const result = await uploadFile(file, 'activity_photo');
      if (!result.ok) {
        setError(`${file.name}: ${result.message}`);
        break;
      }
      setPhotos((current) => [...current, { fileId: result.fileId, originalName: file.name }]);
    }
    setUploading(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      plannedActivityId: plannedActivityId || null,
      heldOn,
      timeText: timeText || null,
      title,
      location: location || null,
      summary: summary || null,
      participantUserIds: [...participants],
      participantCount: participants.size === 0 && participantCount ? Number(participantCount) : null,
      photoFileIds: photos.map((p) => p.fileId),
    };
    const result = activity
      ? await apiSend('PUT', `/activities/${activity.id}`, body)
      : await apiSend('POST', `/clubs/${clubId}/activities`, body);
    setSaving(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    const id = activity ? activity.id : (result.data as { id: string }).id;
    router.push(`/activities/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      {plans.length > 0 && (
        <Field label="ตามแผนกิจกรรม (ถ้ามี)">
          <select value={plannedActivityId} onChange={(e) => choosePlan(e.target.value)} className="field">
            <option value="">— ไม่อยู่ในแผน —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="ชื่อกิจกรรม *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} className="field" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="วันที่จัด *">
          <input type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} required max={today} className="field" />
        </Field>
        <Field label="เวลา">
          <input value={timeText} onChange={(e) => setTimeText(e.target.value)} maxLength={100} placeholder="เช่น 17.00–19.00 น." className="field" />
        </Field>
        <Field label="สถานที่">
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} className="field" />
        </Field>
      </div>
      <Field label="สรุปผลการจัดกิจกรรม">
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={5000} className="field" />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">ผู้เข้าร่วม</legend>
        <p className="text-xs text-mist">เลือกสมาชิกที่เข้าร่วม (ระบบนับให้) หรือถ้าไม่เลือก ให้กรอกจำนวนผู้เข้าร่วม</p>
        {members.length > 0 && (
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-ink/[0.08] p-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.userId} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-matcha-50">
                <input type="checkbox" checked={participants.has(m.userId)} onChange={() => toggle(m.userId)} className="size-4 accent-matcha-700" />
                {m.name}
              </label>
            ))}
          </div>
        )}
        {participants.size > 0 ? (
          <p className="text-sm text-matcha-700">เลือกแล้ว {participants.size} คน</p>
        ) : (
          <input
            type="number"
            min={0}
            value={participantCount}
            onChange={(e) => setParticipantCount(e.target.value)}
            placeholder="จำนวนผู้เข้าร่วม (คน)"
            aria-label="จำนวนผู้เข้าร่วม"
            className="field max-w-xs"
          />
        )}
      </fieldset>

      <div className="grid gap-2">
        <span className="text-sm font-medium">รูปกิจกรรม</span>
        {photos.length > 0 && (
          <ul className="grid gap-1.5">
            {photos.map((photo) => (
              <li key={photo.fileId} className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.08] px-3 py-2 text-sm">
                <span className="truncate">{photo.originalName}</span>
                <button type="button" onClick={() => setPhotos((c) => c.filter((p) => p.fileId !== photo.fileId))} className="shrink-0 text-xs text-beni underline">
                  เอาออก
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={photoInputId} className={`btn btn-secondary !min-h-10 cursor-pointer text-sm ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              <Icon name="plus" className="size-4" />
              {uploading ? 'กำลังอัปโหลด...' : 'แนบรูป'}
            </label>
            <input id={photoInputId} type="file" accept={ACCEPT} multiple onChange={handlePhotos} className="sr-only" data-testid="photo-input" />
            <span className="text-xs text-mist">JPG / PNG / WebP ไม่เกิน 10 MB สูงสุด {MAX_PHOTOS} รูป</span>
          </div>
        )}
        <p className="text-xs text-mist">รายชื่อผู้เข้าร่วมและรูปเห็นเฉพาะสมาชิกชมรมและผู้ดูแล</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-beni">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || uploading} className="btn btn-primary">
          {saving ? 'กำลังบันทึก...' : activity ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรม'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
