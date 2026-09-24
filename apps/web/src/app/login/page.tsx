import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { publicEnv } from '@/lib/public-env';

// ข้อความตามรหัส error ที่ API ส่งกลับมาใน ?error=
const ERROR_MESSAGES: Record<string, string> = {
  login_failed: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  email_not_verified: 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล',
  domain_not_allowed: 'ระบบนี้รองรับเฉพาะบัญชี @msu.ac.th เท่านั้น',
  account_disabled: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // login อยู่แล้วไม่ต้องเห็นหน้านี้
  if (await getCurrentUser()) {
    redirect('/');
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.login_failed) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold sm:text-2xl">ระบบจัดการชมรมกีฬาบุคลากร</h1>
        <p className="mt-1 text-slate-600">มหาวิทยาลัยมหาสารคาม</p>

        {errorMessage && (
          <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </p>
        )}

        {/* ลิงก์ธรรมดา (ไม่ใช่ fetch) เพราะต้องพาผู้ใช้ไปหน้า Google ทั้งหน้า */}
        <a
          href={`${publicEnv.apiUrl}/auth/google`}
          className="mt-6 flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-700"
        >
          เข้าสู่ระบบด้วยบัญชี @msu.ac.th
        </a>
        <p className="mt-3 text-center text-sm text-slate-500">ใช้บัญชี Google ของมหาวิทยาลัย</p>
      </div>
    </main>
  );
}
