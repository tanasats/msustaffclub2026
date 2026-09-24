// ปีงบประมาณของมหาวิทยาลัย: 1 ต.ค. – 30 ก.ย. เก็บเป็นปี พ.ศ.
// เช่น ปีงบประมาณ 2570 = 1 ต.ค. 2569 – 30 ก.ย. 2570 (ค.ศ. 2026-10-01 – 2027-09-30)
// คำนวณตามเวลาประเทศไทยเสมอ (server อาจตั้ง timezone เป็น UTC)
const TIMEZONE = 'Asia/Bangkok';
const BUDDHIST_ERA_OFFSET = 543;

function bangkokYearMonthDay(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function fiscalYearOf(date: Date = new Date()): number {
  const { year, month } = bangkokYearMonthDay(date);
  return year + BUDDHIST_ERA_OFFSET + (month >= 10 ? 1 : 0);
}

// ช่วงวันของปีงบประมาณในรูป 'YYYY-MM-DD' (ค.ศ.) สำหรับเก็บลงคอลัมน์ date
export function fiscalYearRange(fiscalYear: number): { start: string; end: string } {
  const endYear = fiscalYear - BUDDHIST_ERA_OFFSET;
  return { start: `${endYear - 1}-10-01`, end: `${endYear}-09-30` };
}

// ปี พ.ศ. ปัจจุบัน (ปีปฏิทิน) ตามเวลาประเทศไทย
export function buddhistYearOf(date: Date = new Date()): number {
  return bangkokYearMonthDay(date).year + BUDDHIST_ERA_OFFSET;
}

// วันที่ปัจจุบันตามเวลาประเทศไทยในรูป 'YYYY-MM-DD'
export function bangkokDateString(date: Date = new Date()): string {
  const { year, month, day } = bangkokYearMonthDay(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];

// แปลงเลขอารบิกเป็นเลขไทย (ใช้ในเอกสารราชการ เช่น ระเบียบชมรม)
export function toThaiDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => THAI_DIGITS[Number(digit)]!);
}
