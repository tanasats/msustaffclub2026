'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';

export interface ProvisionValues {
  email: string;
  prefixNameTh: string;
  firstNameTh: string;
  lastNameTh: string;
  prefixNameEn: string;
  firstNameEn: string;
  lastNameEn: string;
  orgUnitId: string;
  positionNameTh: string;
}

const EMPTY: ProvisionValues = {
  email: '',
  prefixNameTh: '',
  firstNameTh: '',
  lastNameTh: '',
  prefixNameEn: '',
  firstNameEn: '',
  lastNameEn: '',
  orgUnitId: '',
  positionNameTh: '',
};

/**
 * เพิ่ม/แก้ข้อมูลบุคลากรที่ยังไม่เคยเข้าระบบ (ผู้ดูแลระบบ) — API ตรวจสิทธิ์ user_account:create และความถูกต้องซ้ำ
 * userId = แก้ไขบัญชีเดิม, ไม่มี = เพิ่มใหม่ (เพิ่มแล้วไปหน้ารายละเอียดผู้ใช้)
 */
export function ProvisionUserForm({
  orgUnits,
  userId,
  initial,
}: {
  orgUnits: { id: string; code: string; nameTh: string }[];
  userId?: string;
  initial?: Partial<ProvisionValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProvisionValues>({ ...EMPTY, ...initial });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof ProvisionValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await apiSend(userId ? 'PUT' : 'POST', userId ? `/provisioned-users/${userId}` : '/provisioned-users', values);
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    if (userId) {
      setSaved(true);
      router.refresh();
    } else {
      const created = result.data as { id: string };
      router.push(`/admin/users/${created.id}`);
    }
  }

  const field = 'field';
  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        อีเมล @msu.ac.th *
        <input type="email" required value={values.email} onChange={set('email')} maxLength={200} className={field} autoComplete="off" />
        <span className="text-xs text-stone">ใช้ผูกบัญชีอัตโนมัติเมื่อเจ้าตัวเข้าสู่ระบบด้วย Google ครั้งแรก</span>
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm">ชื่อภาษาไทย *</legend>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_1fr]">
          <input required value={values.prefixNameTh} onChange={set('prefixNameTh')} placeholder="คำนำหน้า เช่น นาย / รองศาสตราจารย์ ดร." aria-label="คำนำหน้า (ไทย)" maxLength={100} className={field} />
          <input required value={values.firstNameTh} onChange={set('firstNameTh')} placeholder="ชื่อ" aria-label="ชื่อ (ไทย)" maxLength={100} className={field} />
          <input required value={values.lastNameTh} onChange={set('lastNameTh')} placeholder="นามสกุล" aria-label="นามสกุล (ไทย)" maxLength={100} className={field} />
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm">ชื่อภาษาอังกฤษ (ใช้ในใบประกาศ/รางวัล)</legend>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_1fr]">
          <input value={values.prefixNameEn} onChange={set('prefixNameEn')} placeholder="Title e.g. Assoc. Prof. Dr." aria-label="คำนำหน้า (อังกฤษ)" maxLength={100} className={field} />
          <input value={values.firstNameEn} onChange={set('firstNameEn')} placeholder="First name" aria-label="ชื่อ (อังกฤษ)" maxLength={100} className={field} />
          <input value={values.lastNameEn} onChange={set('lastNameEn')} placeholder="Last name" aria-label="นามสกุล (อังกฤษ)" maxLength={100} className={field} />
        </div>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          หน่วยงาน *
          <select required value={values.orgUnitId} onChange={set('orgUnitId')} className={field}>
            <option value="">เลือกหน่วยงาน</option>
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          ตำแหน่ง
          <input value={values.positionNameTh} onChange={set('positionNameTh')} maxLength={200} className={field} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'กำลังบันทึก...' : userId ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้'}
        </button>
        {saved && <span className="text-sm text-matcha-700">บันทึกแล้ว</span>}
        {error && (
          <span role="alert" className="text-sm text-beni">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
