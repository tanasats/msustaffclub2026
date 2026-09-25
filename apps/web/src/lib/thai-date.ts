// วันที่/ปีงบประมาณแบบไทย ตามเวลาประเทศไทย (ปีงบประมาณ 1 ต.ค. – 30 ก.ย.)
const TZ = 'Asia/Bangkok';

function bangkokParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

// วันนี้ตามเวลาประเทศไทย รูปแบบ YYYY-MM-DD (ใช้กับ <input type="date">)
export function bangkokToday(date = new Date()): string {
  const { year, month, day } = bangkokParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function fiscalYearOf(date = new Date()): number {
  const { year, month } = bangkokParts(date);
  return year + 543 + (month >= 10 ? 1 : 0);
}

// จำนวนวันที่เหลือถึงสิ้นปีงบประมาณ (30 ก.ย.)
export function daysLeftInFiscalYear(date = new Date()): number {
  const { year, month, day } = bangkokParts(date);
  const endYear = month >= 10 ? year + 1 : year;
  const today = Date.UTC(year, month - 1, day);
  return Math.round((Date.UTC(endYear, 8, 30) - today) / 86_400_000);
}

export function thaiLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function greetingOf(date = new Date()): string {
  const { hour } = bangkokParts(date);
  if (hour < 12) return 'สวัสดีตอนเช้า';
  if (hour < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}
