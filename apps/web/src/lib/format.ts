// จัดรูปแบบวันเวลาแบบไทย (พ.ศ.) ตามเวลาประเทศไทย
const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '-';
}
