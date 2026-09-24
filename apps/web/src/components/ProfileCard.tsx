import type { UserProfile } from '@/lib/auth';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium sm:col-span-2">{value || '-'}</dd>
    </div>
  );
}

// แสดงข้อมูลนิสิต/บุคลากรของผู้ใช้ปัจจุบัน (มี empty state เมื่อยังไม่มีข้อมูล)
export function ProfileCard({ profile }: { profile: UserProfile }) {
  if (profile.type === 'student') {
    const { student } = profile;
    return (
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">ข้อมูลนิสิต</h2>
        {student ? (
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="รหัสนิสิต" value={student.studentCode} />
            <Row label="คณะ" value={student.faculty?.nameTh ?? 'ไม่พบข้อมูลคณะ'} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-600">ยังไม่มีข้อมูลนิสิต</p>
        )}
      </section>
    );
  }

  const { staff } = profile;
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="font-semibold">ข้อมูลบุคลากร</h2>
      {staff ? (
        <dl className="mt-2 divide-y divide-slate-100">
          <Row label="รหัสบุคลากร" value={staff.staffCode} />
          <Row label="ชื่อ-นามสกุล" value={staff.fullNameTh} />
          <Row label="ตำแหน่ง" value={staff.positionNameTh} />
          <Row label="คณะ / สำนัก" value={staff.facultyName} />
          <Row label="กอง / ฝ่าย" value={staff.departmentName} />
          <Row label="กลุ่มงาน / สาขา" value={staff.programName} />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          ยังดึงข้อมูลบุคลากรจากระบบ ERP ไม่สำเร็จ ระบบจะลองใหม่เมื่อคุณเข้าสู่ระบบครั้งถัดไป
        </p>
      )}
    </section>
  );
}
