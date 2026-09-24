import { z } from 'zod';
import { config } from '../config/index.js';

// ข้อมูลบุคลากรจาก ERP-HR (ดูเอกสาร docs/erp_hr_msu_staff_info_integration.md)
// ทุกฟิลด์อาจเป็น null ได้ จึงตรวจรูปแบบด้วย Zod ก่อนใช้ ไม่เชื่อข้อมูลภายนอกตรง ๆ
const nullableText = z.string().nullish().transform((value) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
});

const staffInfoResponseSchema = z.object({
  status: z.boolean(),
  data: z
    .object({
      staffid: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
      prefixfullname: nullableText,
      staffname: nullableText,
      staffsurname: nullableText,
      prefixinitialseng: nullableText,
      staffnameeng: nullableText,
      staffsurnameeng: nullableText,
      posnameth: nullableText,
      facultyid: nullableText,
      facultyname: nullableText,
      departmentid: nullableText,
      departmentname: nullableText,
      programid: nullableText,
      programname: nullableText,
    })
    .nullish(),
});

export interface ErpStaffInfo {
  staffCode: string;
  prefixNameTh: string | null;
  firstNameTh: string | null;
  lastNameTh: string | null;
  prefixNameEn: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  positionNameTh: string | null;
  erpFacultyId: string | null;
  erpFacultyName: string | null;
  erpDepartmentId: string | null;
  erpDepartmentName: string | null;
  erpProgramId: string | null;
  erpProgramName: string | null;
}

export const erpHr = {
  /**
   * ดึงข้อมูลบุคลากรของเจ้าของ access token
   * คืน null ถ้า ERP ตอบว่าไม่พบข้อมูล (status = false), โยน error ถ้าเรียกไม่สำเร็จหรือหมดเวลา
   */
  async fetchStaffInfo(accessToken: string): Promise<ErpStaffInfo | null> {
    const res = await fetch(config.erpHr.staffInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.erpHr.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`ERP-HR ตอบ HTTP ${res.status}`);
    }

    const parsed = staffInfoResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error('รูปแบบข้อมูลจาก ERP-HR ไม่ตรงกับที่คาดไว้');
    }
    const { status, data } = parsed.data;
    if (!status || !data || !data.staffid) {
      return null;
    }

    return {
      staffCode: data.staffid,
      prefixNameTh: data.prefixfullname,
      firstNameTh: data.staffname,
      lastNameTh: data.staffsurname,
      prefixNameEn: data.prefixinitialseng,
      firstNameEn: data.staffnameeng,
      lastNameEn: data.staffsurnameeng,
      positionNameTh: data.posnameth,
      erpFacultyId: data.facultyid,
      erpFacultyName: data.facultyname,
      erpDepartmentId: data.departmentid,
      erpDepartmentName: data.departmentname,
      erpProgramId: data.programid,
      erpProgramName: data.programname,
    };
  },
};
