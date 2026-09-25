import type { UserProfile } from '@/lib/auth';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-sm text-stone">{label}</dt>
      <dd className="text-[0.9375rem] text-ink">{value || '—'}</dd>
    </div>
  );
}

// ข้อมูลนิสิต/บุคลากร (เนื้อหาภายในช่อง Bento)
export function ProfileDetails({ profile }: { profile: UserProfile }) {
  if (profile.type === 'student') {
    const { student } = profile;
    if (!student) return <p className="text-sm text-stone">ยังไม่มีข้อมูลนิสิต</p>;
    return (
      <dl className="divide-y divide-ink/[0.06]">
        <Row label="รหัสนิสิต" value={student.studentCode} />
        <Row label="คณะ" value={student.faculty?.nameTh ?? 'ไม่พบข้อมูลคณะ'} />
      </dl>
    );
  }
  const { staff } = profile;
  if (!staff) {
    return (
      <p className="text-sm leading-relaxed text-stone">
        ยังดึงข้อมูลบุคลากรจากระบบ ERP ไม่สำเร็จ ระบบจะลองใหม่เมื่อคุณเข้าสู่ระบบครั้งถัดไป
      </p>
    );
  }
  return (
    <dl className="divide-y divide-ink/[0.06]">
      <Row label="ชื่อ-นามสกุล" value={staff.fullNameTh} />
      <Row label="ตำแหน่ง" value={staff.positionNameTh} />
      <Row label="หน่วยงานสังกัด" value={staff.orgUnit?.nameTh ?? staff.departmentName ?? staff.facultyName} />
      <Row label="รหัสบุคลากร" value={staff.staffCode} />
    </dl>
  );
}
