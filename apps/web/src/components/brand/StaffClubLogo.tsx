import { FULL_VIEWBOX, MARK_PATH, MARK_VIEWBOX, WORDMARK_PATHS } from './staff-club-logo-paths';

// โลโก้เต็ม (สัญลักษณ์ + ชื่อ "สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม") สีตาม currentColor — กำหนดสีด้วย text-* และขนาดด้วย h-*/w-*
export function StaffClubLogo({ className = 'h-16 w-auto' }: { className?: string }) {
  return (
    <svg viewBox={FULL_VIEWBOX} role="img" aria-label="สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม" className={className}>
      <g fill="currentColor" fillRule="evenodd">
        <path d={MARK_PATH} />
        {WORDMARK_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ลายพื้นหลังจากสัญลักษณ์สโมสร (ตกแต่งเท่านั้น ไม่มีข้อความ) — สีตาม currentColor กำหนดตำแหน่ง/ขนาด/ความจางด้วย className
export function LogoWatermark({ className }: { className: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true" className={`pointer-events-none ${className}`}>
      <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
