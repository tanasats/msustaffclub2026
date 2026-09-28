import { LogoutButton } from '@/components/LogoutButton';
import { LogoMark } from '@/components/ui/icons';
import { AcknowledgePrivacyButton } from './AcknowledgePrivacyButton';
import { PRIVACY_NOTICE_VERSION, PrivacyNotice } from './PrivacyNotice';

// ผู้ใช้ที่ยังไม่รับทราบประกาศเวอร์ชันปัจจุบัน: แสดงประกาศเต็มแทนหน้าที่ขอ (login ครั้งแรก / ประกาศเปลี่ยนเวอร์ชัน)
export function PrivacyGate({ updated }: { updated: boolean }) {
  return (
    <div className="min-h-dvh bg-washi px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="font-serif font-medium">ระบบบริหารจัดการชมรมบุคลากร</span>
        </div>
        <p role="status" className="mb-6 rounded-bento border border-kin/30 bg-kin-50 p-4 text-sm text-ink">
          {updated
            ? 'ประกาศความเป็นส่วนตัวมีการปรับปรุง กรุณาอ่านฉบับใหม่และกด “รับทราบ” ก่อนใช้งานต่อ'
            : 'ก่อนเริ่มใช้งาน กรุณาอ่านประกาศความเป็นส่วนตัวของระบบ แล้วกด “รับทราบ” ด้านล่าง'}
        </p>
        <div className="bento p-5 sm:p-8">
          <PrivacyNotice />
          <div className="mt-8 flex flex-col gap-3 border-t border-ink/[0.08] pt-6 sm:flex-row sm:items-start sm:justify-between">
            <AcknowledgePrivacyButton version={PRIVACY_NOTICE_VERSION} />
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
