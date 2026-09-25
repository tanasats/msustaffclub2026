import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { ProfileDetails } from '@/components/ProfileCard';
import { FontSizeControl } from '@/components/settings/FontSizeControl';
import { SidebarPreference } from '@/components/settings/SidebarPreference';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Bento, BentoLabel, BentoTitle } from '@/components/ui/Bento';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCurrentUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/navigation';

const PRIVILEGED = ['super_admin', 'club_officer', 'club_president'];

export default async function SettingsPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  const { user, roles, permissions, profile } = current;
  const canManageRoles = roles.includes('super_admin') || permissions.includes('user_role:assign');

  return (
    <>
      <PageHeader eyebrow="Settings" title="การตั้งค่า" description="ข้อมูลบัญชี ขนาดตัวอักษร การแสดงผล และการออกจากระบบ" />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <Bento className="lg:col-span-2">
          <BentoLabel className="mb-4">บัญชีผู้ใช้</BentoLabel>
          <div className="flex items-center gap-4">
            <Avatar name={user.name} email={user.email} pictureUrl={user.pictureUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-serif text-xl font-medium">{user.name ?? user.email}</p>
              <p className="truncate text-sm text-stone">{user.email}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {roles.map((code) => (
              <Badge key={code} tone={PRIVILEGED.includes(code) ? 'kin' : 'matcha'}>
                {ROLE_LABELS[code] ?? code}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-stone">
            ชื่อและรูปโปรไฟล์มาจากบัญชี Google ของมหาวิทยาลัย และอัปเดตทุกครั้งที่เข้าสู่ระบบ
          </p>
        </Bento>

        <Bento tone="cream" className="order-last flex flex-col justify-between gap-6 lg:order-none">
          <div>
            <BentoLabel className="mb-3">ออกจากระบบ</BentoLabel>
            <p className="text-sm leading-relaxed text-stone">ออกจากระบบบนอุปกรณ์นี้ เซสชันจะถูกยกเลิกทันที</p>
          </div>
          <LogoutButton />
        </Bento>

        <Bento className="lg:col-span-2">
          <BentoTitle className="mb-3">{profile.type === 'student' ? 'ข้อมูลนิสิต' : 'ข้อมูลบุคลากร'}</BentoTitle>
          <ProfileDetails profile={profile} />
          {profile.type === 'staff' && <p className="mt-3 text-xs text-mist">ข้อมูลจากระบบ ERP-HR ของมหาวิทยาลัย</p>}
        </Bento>

        <div className="grid gap-3 sm:gap-4">
          <Bento>
            <BentoLabel className="mb-4">การแสดงผล</BentoLabel>
            <FontSizeControl initial={current.preferences.fontScale} />
            <div className="mt-4 border-t border-ink/[0.06] pt-4">
              <SidebarPreference />
            </div>
          </Bento>
          {canManageRoles && (
            <Link href="/admin/users" className="bento flex min-h-11 items-center justify-between gap-3 p-5 transition hover:border-matcha-300 sm:p-6">
              <span className="flex items-center gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-kin-50 text-kin">
                  <Icon name="shield" className="size-[1.125rem]" />
                </span>
                <span className="text-[0.9375rem]">จัดการสิทธิ์ผู้ใช้</span>
              </span>
              <Icon name="arrowRight" className="size-4 text-stone" />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
