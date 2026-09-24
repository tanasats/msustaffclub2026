import { describe, expect, it } from 'vitest';
import { classifyAccount } from '../src/services/account-type.js';

describe('classifyAccount', () => {
  it('ตัวเลข 11 หลัก = นิสิต และรหัสคณะคือหลักที่ 5-6', () => {
    expect(classifyAccount('65010999001@msu.ac.th')).toEqual({
      type: 'student',
      studentCode: '65010999001',
      facultyCode: '09',
    });
  });

  it.each(['somchai.j@msu.ac.th', '6501099900@msu.ac.th', '650109990011@msu.ac.th', '6501099900a@msu.ac.th', 'sport2024@msu.ac.th'])(
    '%s = บุคลากร',
    (email) => {
      expect(classifyAccount(email)).toEqual({ type: 'staff' });
    },
  );
});
