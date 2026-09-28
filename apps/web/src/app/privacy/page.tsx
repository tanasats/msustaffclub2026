import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { LogoMark } from '@/components/ui/icons';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'ประกาศความเป็นส่วนตัว — ระบบบริหารจัดการชมรมบุคลากร' };

// public: อ่านได้โดยไม่ต้องเข้าสู่ระบบ (ผู้ใช้ที่ login แล้วเห็นในกรอบเมนูปกติ)
export default async function PrivacyPage() {
  const current = await getCurrentUser().catch(() => null);
  if (current) {
    return (
      <div className="bento mx-auto max-w-3xl p-5 sm:p-8">
        <PrivacyNotice />
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-washi">
      <header className="border-b border-ink/[0.08]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="size-9" />
            <span className="font-serif font-medium">ระบบบริหารจัดการชมรมบุคลากร</span>
          </Link>
          <Link href="/login" className="btn btn-primary !min-h-10 text-sm">
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PrivacyNotice />
      </main>
    </div>
  );
}
