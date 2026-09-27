'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';
import type { EmailEventSetting } from '@/lib/email-settings-types';

interface EmailSettingsFormProps {
  enabled: boolean;
  events: EmailEventSetting[];
  transport: 'log' | 'gmail';
}

// สวิตช์เปิด/ปิด (checkbox ที่ดูเป็นสวิตช์ — ใช้ label จริงจึงอ่านด้วยโปรแกรมอ่านหน้าจอได้)
function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    // ปิดใช้งาน: ไม่ทำให้ตัวอักษรจาง (อ่านง่ายเสมอ) แสดงด้วยสีของสวิตช์และข้อความกำกับแทน
    <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <span>
        <span className="block font-medium text-ink">{label}</span>
        {hint && <span className="block text-sm text-stone">{hint}</span>}
        {disabled && <span className="block text-xs text-stone">ใช้ได้เมื่อเปิดสวิตช์หลัก</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-sand transition peer-checked:bg-matcha-700 peer-disabled:bg-sand peer-disabled:peer-checked:bg-matcha-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-matcha-600" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

// ฟอร์มตั้งค่าอีเมล: สวิตช์หลัก + รายเหตุการณ์ + ส่งอีเมลทดสอบถึงตัวเอง (API ตรวจ system_setting:manage ทุกครั้ง)
export function EmailSettingsForm({ enabled: initialEnabled, events: initialEvents, transport }: EmailSettingsFormProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [events, setEvents] = useState(initialEvents);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const dirty = enabled !== initialEnabled || events.some((e, i) => e.enabled !== initialEvents[i]!.enabled);

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await apiSend('PUT', '/admin/email-settings', {
      enabled,
      events: Object.fromEntries(events.map((e) => [e.code, e.enabled])),
    });
    setSaving(false);
    setMessage(result.ok ? { tone: 'ok', text: 'บันทึกการตั้งค่าแล้ว' } : { tone: 'error', text: result.errorMessage ?? 'บันทึกไม่สำเร็จ' });
    if (result.ok) router.refresh();
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    const result = await apiSend('POST', '/admin/email-settings/test');
    setTesting(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.errorMessage ?? 'ส่งอีเมลทดสอบไม่สำเร็จ' });
    } else if ((result.data as { delivered: boolean }).delivered) {
      setMessage({ tone: 'ok', text: 'ส่งอีเมลทดสอบถึงอีเมลของคุณแล้ว กรุณาตรวจกล่องจดหมาย (รวมถึงโฟลเดอร์สแปม)' });
    } else {
      setMessage({ tone: 'error', text: 'ระบบอยู่ในโหมด log (MAIL_TRANSPORT=log) จึงไม่ได้ส่งอีเมลจริง — ตั้งค่า Gmail ตาม docs/email-setup.md ก่อน' });
    }
  }

  return (
    <div className="grid gap-5">
      <div className="divide-y divide-ink/[0.08]">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="เปิดการส่งอีเมลแจ้งเตือน (สวิตช์หลัก)"
          hint="ปิด = ไม่สร้างและไม่ส่งอีเมลใด ๆ อีเมลที่ค้างอยู่เกิน 24 ชั่วโมงจะถูกยกเลิก"
        />
        {events.map((event, index) => (
          <Switch
            key={event.code}
            checked={event.enabled}
            disabled={!enabled}
            onChange={(value) => setEvents((current) => current.map((e, i) => (i === index ? { ...e, enabled: value } : e)))}
            label={event.label}
            hint={`ผู้รับ: ${event.recipients}`}
          />
        ))}
      </div>

      {message && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.tone === 'ok' ? 'border-matcha-300 bg-matcha-50 text-matcha-900' : 'border-beni/30 bg-beni-50 text-beni'}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving || !dirty} className="btn btn-primary">
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </button>
        <button type="button" onClick={sendTest} disabled={testing} className="btn btn-secondary">
          {testing ? 'กำลังส่ง...' : 'ส่งอีเมลทดสอบถึงตัวเอง'}
        </button>
      </div>
      {transport === 'log' && <p className="text-xs text-stone">โหมด log: ปุ่มทดสอบจะไม่ส่งอีเมลจริง</p>}
    </div>
  );
}
