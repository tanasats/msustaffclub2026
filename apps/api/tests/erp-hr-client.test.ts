import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { erpHr } from '../src/services/erp-hr-client.js';

// mock เฉพาะ fetch (การเรียก ERP ภายนอก)
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const erpData = {
  staffid: '1234567',
  prefixid: '003',
  prefixfullname: 'นางสาว',
  namefully: 'สมหญิง ตัวอย่าง',
  staffname: 'สมหญิง',
  staffsurname: 'ตัวอย่าง',
  prefixinitialseng: 'Ms.',
  staffnameeng: 'Somying',
  staffsurnameeng: 'Tuayang',
  posnameth: 'นักวิชาการคอมพิวเตอร์',
  facultyid: '201092700000',
  facultyname: 'สำนักงานอธิการบดี',
  departmentid: '201092704000',
  departmentname: 'กองแผนงาน',
  programid: '201092704003',
  programname: 'กลุ่มงานสารสนเทศเพื่อพัฒนาองค์กรสู่ความเป็นเลศ',
  staffphone1: '0800000000',
  staffphone2: null,
  staffemail1: 'somying.t@msu.ac.th',
  staffemail2: 'somying.t@msu.ac.th',
  posadid: null,
  adhisposname: null,
};

describe('erpHr.fetchStaffInfo', () => {
  it('ส่ง Bearer token ไปที่ URL จาก config และแปลงข้อมูลตามตัวอย่างในเอกสาร (ไม่เอาเบอร์โทร)', async () => {
    const fetchMock = stubFetch(200, { status: true, message: 'Success', data: erpData });

    const info = await erpHr.fetchStaffInfo('access-token-123');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.erpHr.staffInfoUrl);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token-123');
    expect(info).toEqual({
      staffCode: '1234567',
      prefixNameTh: 'นางสาว',
      firstNameTh: 'สมหญิง',
      lastNameTh: 'ตัวอย่าง',
      prefixNameEn: 'Ms.',
      firstNameEn: 'Somying',
      lastNameEn: 'Tuayang',
      positionNameTh: 'นักวิชาการคอมพิวเตอร์',
      erpFacultyId: '201092700000',
      erpFacultyName: 'สำนักงานอธิการบดี',
      erpDepartmentId: '201092704000',
      erpDepartmentName: 'กองแผนงาน',
      erpProgramId: '201092704003',
      erpProgramName: 'กลุ่มงานสารสนเทศเพื่อพัฒนาองค์กรสู่ความเป็นเลศ',
    });
    expect(JSON.stringify(info)).not.toContain('0800000000');
  });

  it('ฟิลด์ที่เป็น null หรือช่องว่างกลายเป็น null', async () => {
    stubFetch(200, { status: true, data: { ...erpData, posnameth: null, programname: '   ' } });
    const info = await erpHr.fetchStaffInfo('t');
    expect(info?.positionNameTh).toBeNull();
    expect(info?.erpProgramName).toBeNull();
  });

  it('status = false (ไม่พบข้อมูล) → null', async () => {
    stubFetch(200, { status: false, message: 'Not found', data: null });
    expect(await erpHr.fetchStaffInfo('t')).toBeNull();
  });

  it('HTTP error → throw', async () => {
    stubFetch(401, { message: 'Unauthorized' });
    await expect(erpHr.fetchStaffInfo('t')).rejects.toThrow(/HTTP 401/);
  });

  it('รูปแบบข้อมูลผิด → throw', async () => {
    stubFetch(200, { unexpected: true });
    await expect(erpHr.fetchStaffInfo('t')).rejects.toThrow(/รูปแบบข้อมูล/);
  });
});
