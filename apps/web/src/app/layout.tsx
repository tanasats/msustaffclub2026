import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Noto_Serif_Thai } from 'next/font/google';
import { AppShell, type ShellUser } from '@/components/shell/AppShell';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';
import { buildNavigation, ROLE_LABELS } from '@/lib/navigation';
import './globals.css';

// เนื้อหา: IBM Plex Sans Thai (เรียบ อ่านง่าย) / หัวเรื่อง: Noto Serif Thai (ให้อารมณ์ตัวพิมพ์ mincho แบบญี่ปุ่น)
const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});
const serif = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-serif-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ระบบบริหารจัดการชมรมบุคลากร มหาวิทยาลัยมหาสารคาม',
  description: 'ระบบบริหารจัดการชมรมบุคลากร (กีฬา ดนตรี วิชาการ และอื่น ๆ) มหาวิทยาลัยมหาสารคาม',
};

export const viewport: Viewport = {
  themeColor: '#faf8f3',
  viewportFit: 'cover',
};

// บรรทัดรองใต้ชื่อผู้ใช้ใน sidebar: หน่วยงาน/คณะ หรือบทบาทหลัก
function subtitleOf(current: CurrentUser): string {
  const { profile } = current;
  if (profile.type === 'staff' && profile.staff?.orgUnit) return profile.staff.orgUnit.nameTh;
  if (profile.type === 'student' && profile.student?.faculty) return profile.student.faculty.nameTh;
  const main = ['super_admin', 'club_president', 'club_officer', 'staff', 'student'].find((code) => current.roles.includes(code));
  return main ? ROLE_LABELS[main]! : current.user.email;
}

async function loadCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    // API ขัดข้อง: แสดงหน้าโดยไม่มี sidebar (หน้าเองจะแสดง error ตามปกติ)
    return null;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const current = await loadCurrentUser();
  const shellUser: ShellUser | null = current
    ? {
        name: current.user.name,
        email: current.user.email,
        pictureUrl: current.user.pictureUrl,
        subtitle: subtitleOf(current),
      }
    : null;

  return (
    // ขนาดตัวอักษรที่ผู้ใช้ตั้งไว้ (จากฐานข้อมูล) ใส่ตั้งแต่ server render จึงไม่กระพริบเปลี่ยนขนาด
    <html lang="th" data-font-scale={current?.preferences.fontScale ?? 'md'} className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        {current && shellUser ? (
          <AppShell user={shellUser} nav={buildNavigation(current)}>
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
