// แยกประเภทบัญชี @msu.ac.th จากส่วนหน้า @
// - ตัวเลข 11 หลักพอดี = นิสิต (ส่วนหน้า @ คือรหัสนิสิต, หลักที่ 5-6 คือรหัสคณะ)
// - อื่น ๆ ทั้งหมด = บุคลากร
const STUDENT_CODE_PATTERN = /^[0-9]{11}$/;

export type AccountType =
  | { type: 'student'; studentCode: string; facultyCode: string }
  | { type: 'staff' };

export function classifyAccount(email: string): AccountType {
  const localPart = email.slice(0, email.lastIndexOf('@'));
  if (STUDENT_CODE_PATTERN.test(localPart)) {
    // เช่น 65010999001 → หลักที่ 5-6 = "09"
    return { type: 'student', studentCode: localPart, facultyCode: localPart.slice(4, 6) };
  }
  return { type: 'staff' };
}
