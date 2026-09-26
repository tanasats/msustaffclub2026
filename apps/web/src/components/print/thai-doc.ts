// ตัวช่วยจัดรูปแบบข้อความในเอกสารราชการ (เลขไทย, วันที่แบบไทย)

const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function thaiDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => THAI_DIGITS[Number(d)]!);
}

// วันที่ตามเวลาประเทศไทย → { day, month, year } (ปี พ.ศ.) เป็นเลขไทย
export function thaiDateParts(value: string | Date): { day: string; month: string; year: string } {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+07:00`) : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { day: thaiDigits(get('day')), month: THAI_MONTHS[get('month') - 1]!, year: thaiDigits(get('year') + 543) };
}

export function thaiLongDate(value: string | Date): string {
  const { day, month, year } = thaiDateParts(value);
  return `${day} ${month} ${year}`;
}

// วันที่แบบย่อสำหรับตาราง เช่น ๒ ก.ย. ๒๕๖๙
export function thaiShortDate(value: string | Date): string {
  const { day, month, year } = thaiDateParts(value);
  return `${day} ${THAI_MONTHS_SHORT[THAI_MONTHS.indexOf(month)]} ${year}`;
}
