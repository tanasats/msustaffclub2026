import { OAuth2Client } from 'google-auth-library';
import type { MailConfig } from '../config/derive.js';
import { logger } from '../logger.js';
import { buildRawMessage, type MailMessage } from './mime.js';

// ตัวส่งอีเมล: โค้ดส่วนอื่นเรียกผ่าน interface นี้เท่านั้น (เปลี่ยนผู้ให้บริการได้โดยแก้ที่นี่ที่เดียว)
export interface MailTransport {
  readonly kind: MailConfig['transport'];
  send(message: MailMessage): Promise<void>;
}

// ไม่ส่งจริง: บันทึกเฉพาะว่ามีการ "ส่ง" (ไม่ log ผู้รับหรือเนื้อหา — ข้อมูลส่วนบุคคล)
class LogTransport implements MailTransport {
  readonly kind = 'log' as const;
  async send(): Promise<void> {
    logger.info('mail: MAIL_TRANSPORT=log — ไม่ได้ส่งอีเมลจริง');
  }
}

// ส่งผ่าน Gmail API ในนามบัญชีผู้ส่ง (refresh token ขอด้วย scripts/gmail-authorize.ts, สิทธิ์ gmail.send เท่านั้น)
class GmailTransport implements MailTransport {
  readonly kind = 'gmail' as const;
  private readonly client: OAuth2Client;

  constructor(
    gmail: NonNullable<MailConfig['gmail']>,
    private readonly from: { address: string; name: string },
  ) {
    this.client = new OAuth2Client({ clientId: gmail.clientId, clientSecret: gmail.clientSecret });
    this.client.setCredentials({ refresh_token: gmail.refreshToken });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.client.request({
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        method: 'POST',
        data: { raw: buildRawMessage(this.from, message) },
        timeout: 15_000,
      });
    } catch (err) {
      // ส่งต่อเฉพาะข้อความย่อ (ห้ามมี token) เช่น "invalid_grant" หรือ "HTTP 403"
      throw new Error(describeGoogleError(err));
    }
  }
}

function describeGoogleError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: unknown; error_description?: string } }; message?: string };
  const data = e.response?.data;
  const code = typeof data?.error === 'string' ? data.error : (data?.error as { message?: string } | undefined)?.message;
  const status = e.response?.status ? `HTTP ${e.response.status}` : null;
  return [status, code, data?.error_description].filter(Boolean).join(' ').slice(0, 300) || (e.message ?? 'ส่งอีเมลไม่สำเร็จ').slice(0, 300);
}

export function createMailTransport(config: MailConfig): MailTransport {
  if (config.transport === 'gmail' && config.gmail && config.fromAddress) {
    return new GmailTransport(config.gmail, { address: config.fromAddress, name: config.fromName });
  }
  return new LogTransport();
}
