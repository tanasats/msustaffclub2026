import { redirect } from 'next/navigation';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { UserDataView } from '@/components/user-data/UserDataView';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { MyData } from '@/lib/my-data-types';

// ข้อมูลทั้งหมดของผู้ใช้ 1 คน (ชุดเดียวกับหน้า "ข้อมูลของฉัน") — permission user_account:inspect (ไม่ผูก role → super_admin)
// ซ่อนหน้าเพื่อ UX เท่านั้น API ตรวจสิทธิ์ซ้ำ (ไม่มีสิทธิ์ → หน้าไม่มีสิทธิ์เข้าถึง)
export default async function AdminUserDataPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  if (!current.roles.includes('super_admin') && !current.permissions.includes('user_account:inspect')) redirect('/forbidden');
  const d = await apiGetJson<MyData>(`/user-accounts/${encodeURIComponent(userId)}/data`);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title={`ข้อมูลทั้งหมดของ ${d.account.name ?? d.account.email}`}
        description="ข้อมูลส่วนบุคคลที่ระบบเก็บไว้ ชุดเดียวกับที่เจ้าของข้อมูลเห็นในหน้า &quot;ข้อมูลของฉัน&quot; — ใช้เพื่อตรวจปัญหาบัญชีเท่านั้น"
        back={{ href: `/admin/users/${userId}`, label: 'รายละเอียดผู้ใช้' }}
      />
      <div className="grid gap-3 sm:gap-4">
        <Bento tone="cream">
          <p className="text-sm leading-relaxed text-ink">
            ข้อมูล ณ {formatDateTime(d.generatedAt)} · ข้อมูลส่วนบุคคล ใช้เท่าที่จำเป็นต่อการดูแลระบบ ห้ามเผยแพร่ (PDPA)
          </p>
        </Bento>
        <UserDataView data={d} viewer="admin" />
      </div>
    </>
  );
}
