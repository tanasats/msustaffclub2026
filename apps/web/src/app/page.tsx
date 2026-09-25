import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StatusBadge } from '@/components/club-applications/StatusBadge';
import { ProfileDetails } from '@/components/ProfileCard';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { buttonClass } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type { ApplicationListItem } from '@/lib/club-application-types';
import { daysLeftInFiscalYear, fiscalYearOf, greetingOf, thaiLongDate } from '@/lib/thai-date';

// ดึงรายการแบบไม่ทำให้หน้าแรกพังถ้า endpoint ใดขัดข้อง (หน้าแรกเป็นแค่ภาพรวม)
async function listOrNull(path: string): Promise<ApplicationListItem[] | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as { items: ApplicationListItem[] }).items : null;
  } catch {
    return null;
  }
}

function StatTile({ href, icon, label, value, hint }: { href: string; icon: IconName; label: string; value: number; hint: string }) {
  return (
    <Link href={href} className="bento group flex flex-col justify-between gap-4 p-4 transition hover:border-matcha-300 hover:bg-white sm:gap-6 sm:p-6">
      <div className="flex items-center justify-between">
        <BentoLabel>{label}</BentoLabel>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-matcha-50 text-matcha-700 transition group-hover:bg-matcha-800 group-hover:text-washi">
          <Icon name={icon} className="size-[18px]" />
        </span>
      </div>
      <div>
        <p className="font-serif text-3xl font-medium text-ink tabular-nums sm:text-4xl">{value}</p>
        <p className="mt-1 text-[13px] leading-snug text-stone sm:text-sm">{hint}</p>
      </div>
    </Link>
  );
}

const STEPS = ['เตรียมข้อมูลชมรม กรรมการ และสมาชิก ≥ 5 คน', 'ที่ปรึกษา 1–2 คนยินยอมในระบบ', 'ยื่นคำขอต่อสโมสรบุคลากร', 'เจ้าหน้าที่สโมสรตรวจ', 'นายกสโมสรอนุมัติ — ชมรมพร้อมใช้งาน'];

export default async function HomePage() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  const { user, roles, permissions, profile } = current;
  const has = (permission: string) => roles.includes('super_admin') || permissions.includes(permission);
  const canApply = has('club_application:create');
  const isStaff = profile.type === 'staff';
  const canWorkQueue = has('club_application:review') || has('club_application:approve') || has('club:read_all');

  const [mine, advisorRequests, queue] = await Promise.all([
    canApply ? listOrNull('/club-applications/mine') : null,
    isStaff ? listOrNull('/club-applications/advisor-requests') : null,
    canWorkQueue ? listOrNull('/club-applications/queue') : null,
  ]);
  const pendingConsent = advisorRequests?.filter((r) => r.status === 'awaiting_consent' && r.myConsentStatus === 'pending') ?? [];
  const openMine = mine?.filter((a) => !['approved', 'rejected', 'cancelled'].includes(a.status)) ?? [];
  const firstName = (user.name ?? user.email).split(' ')[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* ทักทาย */}
      <Bento tone="matcha" className="relative col-span-2 overflow-hidden lg:row-span-2">
        <svg viewBox="0 0 200 200" aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-12 size-64 opacity-[0.12]">
          <path d="M150 48A70 70 0 1 0 168 110" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
        </svg>
        <div className="relative flex h-full flex-col justify-between gap-10">
          <div>
            <p className="text-sm text-matcha-200">{greetingOf()}</p>
            <h1 className="mt-3 font-serif text-3xl leading-snug font-medium sm:text-4xl">คุณ{firstName}</h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-matcha-100/90">
              ระบบบริหารจัดการชมรมบุคลากร มหาวิทยาลัยมหาสารคาม — ชมรมกีฬา ดนตรี วิชาการ และอีกหลากหลาย
            </p>
          </div>
          {canApply && (
            <div className="flex flex-wrap gap-2">
              <Link href="/club-applications" className={buttonClass('secondary', '!border-transparent !bg-washi !text-matcha-900 hover:!bg-cream')}>
                <Icon name="plus" className="size-[18px]" />
                ยื่นคำขอจัดตั้งชมรม
              </Link>
            </div>
          )}
        </div>
      </Bento>

      {/* วันที่และปีงบประมาณ */}
      <Bento tone="cream" className="col-span-2 flex flex-col justify-between gap-6 sm:col-span-1">
        <div className="flex items-center justify-between">
          <BentoLabel>วันนี้</BentoLabel>
          <Icon name="calendar" className="size-[18px] text-stone" />
        </div>
        <div>
          <p className="font-serif text-xl leading-snug font-medium text-ink">{thaiLongDate()}</p>
          <p className="mt-2 text-sm text-stone">
            ปีงบประมาณ {fiscalYearOf()} · เหลืออีก {daysLeftInFiscalYear()} วัน
          </p>
        </div>
      </Bento>

      {canApply && mine ? (
        <StatTile href="/club-applications" icon="scroll" label="คำขอของฉัน" value={openMine.length} hint="คำขอที่กำลังดำเนินการ" />
      ) : (
        <Bento className="flex flex-col justify-between gap-4 p-4 sm:gap-6">
          <BentoLabel>บัญชีของคุณ</BentoLabel>
          <p className="font-serif text-xl font-medium">{profile.type === 'student' ? 'นิสิต' : 'บุคลากร'}</p>
        </Bento>
      )}

      {isStaff && advisorRequests && (
        <StatTile
          href="/club-applications/advisor-requests"
          icon="leaf"
          label="รอคุณยินยอม"
          value={pendingConsent.length}
          hint="คำขอที่เสนอชื่อคุณเป็นที่ปรึกษา"
        />
      )}
      {canWorkQueue && queue && (
        <StatTile href="/club-applications/queue" icon="inbox" label="รอตรวจ/อนุมัติ" value={queue.length} hint="คำขอในกล่องงานของคุณ" />
      )}

      {/* ข้อมูลบุคลากร/นิสิต */}
      <Bento className="col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <BentoTitle>{profile.type === 'student' ? 'ข้อมูลนิสิต' : 'ข้อมูลบุคลากร'}</BentoTitle>
          <Link href="/settings" className="text-sm text-matcha-700 hover:underline">
            การตั้งค่า
          </Link>
        </div>
        <ProfileDetails profile={profile} />
      </Bento>

      {/* คำขอล่าสุด */}
      {canApply && mine && (
        <Bento className="col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <BentoTitle>คำขอล่าสุด</BentoTitle>
            <Link href="/club-applications" className="inline-flex items-center gap-1 text-sm text-matcha-700 hover:underline">
              ทั้งหมด <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
          {mine.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone">ยังไม่มีคำขอ — เริ่มยื่นคำขอจัดตั้งชมรมได้จากปุ่มด้านบน</p>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {mine.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link href={`/club-applications/${item.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-matcha-800">
                    <span className="truncate text-[15px]">{item.nameTh}</span>
                    <StatusBadge status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bento>
      )}

      {/* ขั้นตอนการจัดตั้ง */}
      {canApply && (
        <Bento tone="cream" className="col-span-2 lg:col-span-4">
          <BentoTitle className="mb-4">ขั้นตอนการจัดตั้งชมรม</BentoTitle>
          <ol className="grid gap-3 lg:grid-cols-5 lg:gap-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-[15px]">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-matcha-300 font-serif text-sm text-matcha-700">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-ink/85">{step}</span>
              </li>
            ))}
          </ol>
        </Bento>
      )}
    </div>
  );
}
