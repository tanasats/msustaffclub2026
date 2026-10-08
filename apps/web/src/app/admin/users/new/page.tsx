import { ProvisionUserForm } from '@/components/admin/ProvisionUserForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';

// เพิ่มบุคลากรที่ยังไม่เคยเข้าระบบ (API ต้องมี user_account:create — ไม่มีสิทธิ์ → หน้าไม่มีสิทธิ์เข้าถึง)
export default async function NewProvisionedUserPage() {
  const orgUnits = await apiGetJson<{ items: { id: string; code: string; nameTh: string }[] }>('/provisioning/org-units');
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="เพิ่มผู้ใช้"
        description="สำหรับบุคลากรที่ยังไม่เคยเข้าระบบ เพื่อให้เลือกเป็นที่ปรึกษา ประธาน กรรมการ หรือสมาชิกชมรมได้ เมื่อเจ้าตัวเข้าสู่ระบบด้วย Google ครั้งแรก บัญชีจะผูกกันอัตโนมัติและข้อมูลจะปรับตาม ERP"
        back={{ href: '/admin/users', label: 'รายชื่อผู้ใช้' }}
      />
      <Bento>
        <ProvisionUserForm orgUnits={orgUnits.items} />
      </Bento>
    </>
  );
}
