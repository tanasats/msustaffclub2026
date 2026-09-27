import { EmailSettingsForm } from '@/components/admin/EmailSettingsForm';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { OUTBOX_STATUS_LABELS, type EmailAdmin, type OutboxStatus } from '@/lib/email-settings-types';
import { formatDateTime } from '@/lib/format';

const STATUS_TONES: Record<OutboxStatus, 'neutral' | 'sky' | 'matcha' | 'beni' | 'kin'> = {
  pending: 'sky',
  sending: 'sky',
  sent: 'matcha',
  failed: 'beni',
  skipped: 'neutral',
};

// ตั้งค่าอีเมลแจ้งเตือน — ต้องมี system_setting:manage (API ตอบ 403 → หน้าไม่มีสิทธิ์)
export default async function EmailSettingsPage() {
  const data = await apiGetJson<EmailAdmin>('/admin/email-settings');
  const eventLabel = new Map(data.events.map((e) => [e.code, e.label]));

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="อีเมลแจ้งเตือน"
        description={`ส่งในนาม ${data.fromAddress ?? '(ยังไม่กำหนด MAIL_FROM_ADDRESS)'}${data.updatedAt ? ` · แก้ไขล่าสุด ${formatDateTime(data.updatedAt)} โดย ${data.updatedByName ?? '-'}` : ''}`}
      />

      {data.transport === 'log' && (
        <p role="status" className="mb-4 rounded-bento border border-kin/30 bg-kin-50 p-4 text-sm text-ink">
          <span className="font-medium">ยังไม่ได้ตั้งค่า Gmail</span> — ระบบอยู่ในโหมด log (ไม่ส่งอีเมลจริง) ตั้งค่า
          <code className="mx-1 rounded bg-white px-1">MAIL_TRANSPORT=gmail</code> และค่า GMAIL_* ตาม docs/email-setup.md
        </p>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-2">การส่งอีเมล</BentoTitle>
          <EmailSettingsForm enabled={data.enabled} events={data.events} transport={data.transport} />
        </Bento>
        <div className="grid content-start gap-3 sm:gap-4">
          {(
            [
              ['รอส่ง', data.counts.pending, 'ฉบับ'],
              ['ส่งไม่สำเร็จ', data.counts.failed, 'ฉบับ (ครบจำนวนครั้งที่ลองแล้ว)'],
              ['ส่งสำเร็จ 7 วันล่าสุด', data.counts.sent7d, 'ฉบับ'],
            ] as const
          ).map(([label, value, unit]) => (
            <Bento key={label} tone="cream">
              <BentoLabel>{label}</BentoLabel>
              <p className="mt-1 font-serif text-3xl font-medium tabular-nums">{value.toLocaleString('th-TH')}</p>
              <p className="text-xs text-stone">{unit}</p>
            </Bento>
          ))}
        </div>
      </div>

      <Bento className="mt-3 sm:mt-4">
        <BentoTitle className="mb-3">อีเมลล่าสุด (50 ฉบับ · เก็บประวัติ 90 วัน)</BentoTitle>
        {data.recent.length === 0 ? (
          <p className="text-sm text-stone">ยังไม่มีอีเมลในคิว</p>
        ) : (
          <ul className="grid grid-cols-1 divide-y divide-ink/[0.08]">
            {data.recent.map((mail) => (
              <li key={mail.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:gap-4">
                <div className="min-w-0">
                  <p className="font-medium break-words text-ink">{mail.subject}</p>
                  <p className="text-xs break-all text-stone">
                    {eventLabel.get(mail.kind) ?? mail.kind} · ถึง {mail.recipientEmail} · {formatDateTime(mail.createdAt)}
                    {mail.attempts > 1 ? ` · ลอง ${mail.attempts} ครั้ง` : ''}
                  </p>
                  {mail.lastError && <p className="mt-1 text-xs break-words text-beni">{mail.lastError}</p>}
                </div>
                <div className="sm:text-right">
                  <Badge tone={STATUS_TONES[mail.status]}>{OUTBOX_STATUS_LABELS[mail.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Bento>
    </>
  );
}
