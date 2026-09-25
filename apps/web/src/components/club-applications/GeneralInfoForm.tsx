'use client';

import { useState } from 'react';
import type { ApplicationDetail, ClubCategory } from '@/lib/club-application-types';
import { SaveBar } from './SaveBar';
import { useSave } from './useSave';

const inputClass = 'field';

interface GeneralInfoFormProps {
  application: ApplicationDetail;
  categories: ClubCategory[];
}

// ข้อมูลชมรม: ชื่อ ประเภท ตรา/คำขวัญ วัตถุประสงค์ ประวัติ ที่ทำการ ระเบียบ (หน้า 3, 6, 9, 10–15 ของแบบฟอร์ม)
export function GeneralInfoForm({ application, categories }: GeneralInfoFormProps) {
  const { save, pending, error, saved } = useSave();
  const [form, setForm] = useState({
    nameTh: application.nameTh,
    categoryId: application.category?.id ?? '',
    categoryDetail: application.categoryDetail ?? '',
    motto: application.motto ?? '',
    logoMeaning: application.logoMeaning ?? '',
    history: application.history ?? '',
    officeLocation: application.officeLocation ?? '',
    contactPhone: application.contactPhone ?? '',
    contactEmail: application.contactEmail ?? '',
    regulationText: application.regulationText ?? '',
  });
  const [objectives, setObjectives] = useState<string[]>(
    application.objectives.length > 0 ? application.objectives : [''],
  );
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const selectedCategory = categories.find((c) => c.id === form.categoryId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save('PATCH', `/club-applications/${application.id}`, {
      ...form,
      categoryId: form.categoryId || null,
      contactEmail: form.contactEmail.trim() || null,
      objectives: objectives.map((o) => o.trim()).filter(Boolean),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        ชื่อชมรม *
        <input value={form.nameTh} onChange={set('nameTh')} required maxLength={200} className={inputClass} />
      </label>

      <label className="grid gap-1 text-sm">
        ประเภทของชมรม *
        <select value={form.categoryId} onChange={set('categoryId')} className={inputClass}>
          <option value="">— เลือกประเภท —</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameTh}
            </option>
          ))}
        </select>
      </label>
      {selectedCategory?.requiresDetail && (
        <label className="grid gap-1 text-sm">
          ระบุประเภท *
          <input value={form.categoryDetail} onChange={set('categoryDetail')} maxLength={500} className={inputClass} />
        </label>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm">วัตถุประสงค์ของการจัดตั้งชมรม * (อย่างน้อย 1 ข้อ)</legend>
        {objectives.map((objective, index) => (
          <div key={index} className="flex gap-2">
            <span className="pt-2 text-sm text-mist">{index + 1}.</span>
            <input
              value={objective}
              onChange={(e) => setObjectives((prev) => prev.map((o, i) => (i === index ? e.target.value : o)))}
              maxLength={1000}
              className={`${inputClass} w-full`}
            />
            <button
              type="button"
              onClick={() => setObjectives((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : ['']))}
              className="text-sm text-beni underline"
            >
              ลบ
            </button>
          </div>
        ))}
        {objectives.length < 20 && (
          <button type="button" onClick={() => setObjectives((prev) => [...prev, ''])} className="justify-self-start text-sm text-matcha-700 underline">
            + เพิ่มวัตถุประสงค์
          </button>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          คำขวัญ
          <input value={form.motto} onChange={set('motto')} maxLength={500} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm">
          สถานที่ทำการของชมรม
          <input value={form.officeLocation} onChange={set('officeLocation')} maxLength={500} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm">
          เบอร์โทรศัพท์ติดต่อ
          <input value={form.contactPhone} onChange={set('contactPhone')} maxLength={50} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm">
          อีเมลติดต่อ
          <input type="email" value={form.contactEmail} onChange={set('contactEmail')} maxLength={200} className={inputClass} />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        ความหมายของตราสัญลักษณ์
        <textarea value={form.logoMeaning} onChange={set('logoMeaning')} rows={3} maxLength={5000} className={inputClass} />
      </label>
      <label className="grid gap-1 text-sm">
        ประวัติชมรม (ถ้ามี)
        <textarea value={form.history} onChange={set('history')} rows={4} maxLength={20000} className={inputClass} />
      </label>
      <label className="grid gap-1 text-sm">
        ระเบียบข้อบังคับของชมรม * (ตั้งต้นจากแม่แบบของสโมสร แก้ไขเพิ่มเติมได้)
        <textarea
          value={form.regulationText}
          onChange={set('regulationText')}
          rows={16}
          maxLength={100000}
          className={`${inputClass} !min-h-80 text-sm leading-7`}
        />
      </label>

      <SaveBar pending={pending} error={error} saved={saved} label="บันทึกข้อมูลชมรม" />
    </form>
  );
}
