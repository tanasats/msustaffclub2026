// คลาสปุ่ม (ใช้ได้ทั้ง <button> และ <Link>) ดู utility btn-* ใน globals.css
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function buttonClass(variant: ButtonVariant = 'primary', extra = ''): string {
  return `btn btn-${variant} ${extra}`.trim();
}
