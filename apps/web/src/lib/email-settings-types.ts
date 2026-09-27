// รูปแบบข้อมูลจาก GET /admin/email-settings (ต้องตรงกับ apps/api/src/services/email-admin-service.ts)
export interface EmailEventSetting {
  code: string;
  label: string;
  recipients: string;
  enabled: boolean;
}

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface EmailAdmin {
  transport: 'log' | 'gmail';
  fromAddress: string | null;
  enabled: boolean;
  events: EmailEventSetting[];
  counts: { pending: number; failed: number; sent7d: number };
  recent: {
    id: string;
    kind: string;
    recipientEmail: string;
    subject: string;
    status: OutboxStatus;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    sentAt: string | null;
  }[];
  updatedAt: string | null;
  updatedByName: string | null;
}

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  pending: 'รอส่ง',
  sending: 'กำลังส่ง',
  sent: 'ส่งแล้ว',
  failed: 'ส่งไม่สำเร็จ',
  skipped: 'ยกเลิก',
};
