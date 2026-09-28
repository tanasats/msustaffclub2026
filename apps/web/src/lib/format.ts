// จัดรูปแบบวันเวลาแบบไทย (พ.ศ.) ตามเวลาประเทศไทย
const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '-';
}

const dateFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' });

// วันที่รูปแบบ 'YYYY-MM-DD' (คอลัมน์ date) → '7 พ.ย. 2569' (ตีความเป็น UTC เพื่อไม่ให้วันเลื่อน)
export function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : '-';
}

const timestampDateFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

// เวลาเต็ม (timestamptz) → เฉพาะวันที่ตามเวลาประเทศไทย เช่น '7 พ.ย. 2569' (formatDate ใช้กับคอลัมน์ date เท่านั้น)
export function formatTimestampDate(value: string | null): string {
  return value ? timestampDateFormatter.format(new Date(value)) : '-';
}
