import { apiFetch } from '@/lib/api-server';

async function getApiStatus(): Promise<'ok' | 'down'> {
  try {
    const res = await apiFetch('/health');
    return res.ok ? 'ok' : 'down';
  } catch {
    // API ไม่ตอบ (เช่น ยังไม่ได้เปิด) ให้แสดงสถานะแทนการทำให้หน้าพัง
    return 'down';
  }
}

export default async function HomePage() {
  const apiStatus = await getApiStatus();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">ระบบจัดการชมรมกีฬาบุคลากร</h1>
      <p className="mt-1 text-slate-600">มหาวิทยาลัยมหาสารคาม</p>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">สถานะระบบ</p>
        {apiStatus === 'ok' ? (
          <p className="mt-1 font-medium text-green-700">พร้อมใช้งาน</p>
        ) : (
          <p className="mt-1 font-medium text-red-700">ไม่สามารถเชื่อมต่อระบบหลังบ้านได้</p>
        )}
      </div>
    </main>
  );
}
