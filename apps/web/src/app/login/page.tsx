import { redirect } from 'next/navigation';
import { buttonClass } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/icons';
import { getCurrentUser } from '@/lib/auth';
import { publicEnv } from '@/lib/public-env';

// ข้อความตามรหัส error ที่ API ส่งกลับมาใน ?error=
const ERROR_MESSAGES: Record<string, string> = {
  login_failed: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  email_not_verified: 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล',
  domain_not_allowed: 'ระบบนี้รองรับเฉพาะบัญชี @msu.ac.th เท่านั้น',
  account_disabled: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // login อยู่แล้วไม่ต้องเห็นหน้านี้
  if (await getCurrentUser()) {
    redirect('/');
  }
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.login_failed) : null;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ภาพฝั่งซ้าย (จอใหญ่): พื้นมัทฉะ + วงเอ็นโซ */}
      <section className="relative hidden overflow-hidden bg-matcha-800 p-12 text-washi lg:flex lg:flex-col lg:justify-between">
        <svg viewBox="0 0 200 200" aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/2 size-[36rem] -translate-y-1/2 opacity-[0.10]">
          <path d="M150 48A70 70 0 1 0 168 110" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
        </svg>
        <p className="relative text-sm tracking-[0.3em] text-matcha-200">MAHASARAKHAM UNIVERSITY</p>
        <div className="relative max-w-md">
          <h2 className="font-serif text-4xl leading-snug font-medium">พื้นที่ของชมรม<br />และความสัมพันธ์ของบุคลากร</h2>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-matcha-100/85">
            จัดตั้งชมรม ดูแลสมาชิก และบันทึกผลงาน — ทั้งชมรมกีฬา ดนตรี วิชาการ และอีกหลากหลาย ในที่เดียว
          </p>
        </div>
        <p className="relative text-xs text-matcha-200/70">สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
      </section>

      {/* ฟอร์มเข้าสู่ระบบ */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <LogoMark className="size-14" />
          <p className="mt-8 text-xs font-medium tracking-[0.18em] text-matcha-600 uppercase">Staff Club System</p>
          <h1 className="mt-2 font-serif text-3xl leading-snug font-medium text-ink">ระบบบริหารจัดการชมรมบุคลากร</h1>
          <p className="mt-2 text-stone">มหาวิทยาลัยมหาสารคาม</p>

          {errorMessage && (
            <p role="alert" className="mt-8 rounded-xl border border-beni/20 bg-beni-50 px-4 py-3 text-sm text-beni">
              {errorMessage}
            </p>
          )}

          {/* ลิงก์ธรรมดา (ไม่ใช่ fetch) เพราะต้องพาผู้ใช้ไปหน้า Google ทั้งหน้า */}
          <a href={`${publicEnv.apiUrl}/auth/google`} className={buttonClass('secondary', 'mt-8 w-full !min-h-12 !bg-white')}>
            <GoogleMark />
            เข้าสู่ระบบด้วยบัญชี @msu.ac.th
          </a>
          <p className="mt-4 text-center text-sm text-mist">ใช้บัญชี Google ของมหาวิทยาลัยเท่านั้น</p>
        </div>
      </section>
    </main>
  );
}
