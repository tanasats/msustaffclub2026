import Link from 'next/link';
import type { Invitation } from '@/lib/member-types';
import { StatusBadge } from '@/components/club-applications/StatusBadge';
import { ProfileDetails } from '@/components/ProfileCard';
import { Landing } from '@/components/landing/Landing';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { buttonClass } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import { loadPublicStats } from '@/lib/public-stats';
import type { ApplicationListItem } from '@/lib/club-application-types';
import { daysLeftInFiscalYear, fiscalYearOf, greetingOf, thaiLongDate } from '@/lib/thai-date';
import { LogoWatermark } from '@/components/brand/StaffClubLogo';

// ดึงรายการแบบไม่ทำให้หน้าแรกพังถ้า endpoint ใดขัดข้อง (หน้าแรกเป็นแค่ภาพรวม)
// รายการบนแดชบอร์ด: โหลดไม่ได้ให้ซ่อนกล่องนั้น (ไม่ทำให้ทั้งหน้าล้ม)
async function listOrNull<T = ApplicationListItem>(path: string): Promise<T[] | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as { items: T[] }).items : null;
  } catch {
    return null;
  }
}

function StatTile({ href, icon, label, value, hint }: { href: string; icon: IconName; label: string; value: number; hint: string }) {
  return (
    <Link href={href} className="bento group flex flex-col justify-between gap-4 p-4 transition hover:border-matcha-300 hover:bg-white in-data-[font-scale=xl]:col-span-2 sm:gap-6 sm:p-6 sm:in-data-[font-scale=xl]:col-span-1">
      <div className="flex items-center justify-between">
        <BentoLabel>{label}</BentoLabel>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-matcha-50 text-matcha-700 transition group-hover:bg-matcha-800 group-hover:text-washi">
          <Icon name={icon} className="size-[1.125rem]" />
        </span>
      </div>
      <div>
        <p className="font-serif text-3xl font-medium text-ink tabular-nums sm:text-4xl">{value}</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-stone sm:text-sm">{hint}</p>
      </div>
    </Link>
  );
}

const STEPS = ['เตรียมข้อมูลชมรม กรรมการ และสมาชิก ≥ 5 คน', 'ที่ปรึกษา 1–5 คนยินยอม และประธาน (ถ้าเสนอผู้อื่น) ตอบรับในระบบ', 'ยื่นคำขอต่อสโมสรบุคลากร', 'เจ้าหน้าที่สโมสรตรวจ', 'นายกสโมสรอนุมัติ — ชมรมพร้อมใช้งาน'];

export default async function HomePage() {
  const current = await getCurrentUser();
  // ยังไม่ได้เข้าสู่ระบบ → หน้าแนะนำระบบ (public) แทนแดชบอร์ด
  if (!current) return <Landing stats={await loadPublicStats()} />;
  const { user, roles, permissions, profile, advisor, nominations } = current;
  const has = (permission: string) => roles.includes('super_admin') || permissions.includes(permission);
  const canApply = has('club_application:create');
  const isAdvisor = advisor.pendingConsents > 0 || advisor.activeClubs > 0;
  const canWorkQueue = has('club_application:review') || has('club_application:approve') || has('club:read_all');

  const [mine, queue, invitations] = await Promise.all([
    canApply ? listOrNull('/club-applications/mine') : null,
    canWorkQueue ? listOrNull('/club-applications/queue') : null,
    nominations.clubInvitations > 0 ? listOrNull<Invitation>('/me/club-invitations') : null,
  ]);
  const openMine = mine?.filter((a) => !['approved', 'rejected', 'cancelled'].includes(a.status)) ?? [];
  const firstName = (user.name ?? user.email).split(' ')[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* แจ้งเตือน: ถูกเสนอชื่อเป็นที่ปรึกษาและยังไม่ได้ตอบ */}
      {advisor.pendingConsents > 0 && (
        <div role="status" className="col-span-2 flex flex-col gap-3 rounded-bento border border-kin/30 bg-kin-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:col-span-4">
          <p className="flex items-start gap-3 text-ink">
            <Icon name="leaf" className="mt-0.5 size-5 shrink-0 text-kin" />
            <span>
              <span className="font-medium">คุณถูกเสนอชื่อเป็นที่ปรึกษาชมรม {advisor.pendingConsents} คำขอ</span>
              <span className="block text-sm text-stone">กรุณาอ่านรายละเอียดแล้วตอบยินยอมหรือปฏิเสธ เพื่อให้ชมรมยื่นคำขอต่อได้</span>
            </span>
          </p>
          <Link href="/advisor" className={buttonClass('primary', 'shrink-0')}>
            ไปตอบคำขอ
            <Icon name="arrowRight" className="size-[1.125rem]" />
          </Link>
        </div>
      )}
      {/* แจ้งเตือน: คำเชิญเข้าชมรมที่ยังไม่ได้ตอบ */}
      {invitations && invitations.length > 0 && (
        <div role="status" className="col-span-2 flex flex-col gap-3 rounded-bento border border-kin/30 bg-kin-50 p-4 sm:p-5 lg:col-span-4">
          <p className="flex items-start gap-3 text-ink">
            <Icon name="users" className="mt-0.5 size-5 shrink-0 text-kin" />
            <span className="font-medium">คุณได้รับคำเชิญเข้าชมรม {invitations.length} ชมรม</span>
          </p>
          <ul className="flex flex-wrap gap-2 pl-8">
            {invitations.map((i) => (
              <li key={i.membershipId}>
                <Link href={`/clubs/${i.clubId}`} className={buttonClass('secondary', '!min-h-10 text-sm')}>
                  {i.clubName}
                  <Icon name="arrowRight" className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* แจ้งเตือน: ถูกเสนอชื่อเป็นประธานชมรมและยังไม่ได้ตอบ */}
      {nominations.pendingPresident > 0 && (
        <div role="status" className="col-span-2 flex flex-col gap-3 rounded-bento border border-kin/30 bg-kin-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:col-span-4">
          <p className="flex items-start gap-3 text-ink">
            <Icon name="scroll" className="mt-0.5 size-5 shrink-0 text-kin" />
            <span>
              <span className="font-medium">คุณถูกเสนอชื่อเป็นประธานชมรม {nominations.pendingPresident} คำขอ</span>
              <span className="block text-sm text-stone">กรุณาอ่านรายละเอียดแล้วตอบรับหรือปฏิเสธ เพื่อให้ผู้ยื่นยื่นคำขอต่อได้</span>
            </span>
          </p>
          <Link href="/club-applications" className={buttonClass('primary', 'shrink-0')}>
            ไปตอบรับ
            <Icon name="arrowRight" className="size-[1.125rem]" />
          </Link>
        </div>
      )}
      {/* ทักทาย */}
      <Bento tone="matcha" className="relative col-span-2 overflow-hidden lg:row-span-2">
        <LogoWatermark className="absolute -right-16 -bottom-10 w-96 opacity-[0.12]" />
        <div className="relative flex h-full flex-col justify-between gap-10">
          <div>
            <p className="text-sm text-matcha-200">{greetingOf()}</p>
            <h1 className="mt-3 font-serif text-3xl leading-snug font-medium sm:text-4xl">คุณ{firstName}</h1>
            <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-matcha-50">
              ระบบบริหารจัดการชมรมบุคลากร มหาวิทยาลัยมหาสารคาม — ชมรมกีฬา ดนตรี วิชาการ และอีกหลากหลาย
            </p>
          </div>
          {canApply && (
            <div className="flex flex-wrap gap-2">
              <Link href="/club-applications" className={buttonClass('secondary', '!border-transparent !bg-washi !text-matcha-900 hover:!bg-cream')}>
                <Icon name="plus" className="size-[1.125rem]" />
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
          <Icon name="calendar" className="size-[1.125rem] text-stone" />
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

      {isAdvisor && (
        <StatTile
          href="/advisor"
          icon="leaf"
          label="งานที่ปรึกษา"
          value={advisor.pendingConsents + advisor.reportsToAcknowledge}
          hint="คำขอรอยินยอม และรายงานรอรับทราบ"
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
                    <span className="truncate text-[0.9375rem]">{item.nameTh}</span>
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
              <li key={step} className="flex items-start gap-3 text-[0.9375rem]">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-matcha-300 font-serif text-sm text-matcha-700">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </Bento>
      )}
    </div>
  );
}
