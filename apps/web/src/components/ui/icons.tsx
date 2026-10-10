import { MARK_PATH, MARK_VIEWBOX } from '@/components/brand/staff-club-logo-paths';

// ไอคอนเส้นบาง (stroke 1.5) เขียนเอง ไม่ต้องพึ่งไลบรารีเพิ่ม ขนาดตาม className (ค่าเริ่มต้น 20px)
type IconProps = { className?: string };

function Svg({ className = 'size-5', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const icons = {
  home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9v10.5h13V9" />
      <path d="M10 19.5v-5h4v5" />
    </Svg>
  ),
  scroll: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 4h10a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-3 0V17H5" />
      <path d="M7 4a2 2 0 0 0-2 2v11" />
      <path d="M9 8.5h6M9 12h6" />
    </Svg>
  ),
  leaf: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
      <path d="M5 19 13 11" />
    </Svg>
  ),
  inbox: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 13.5 6.5 5h11L20 13.5" />
      <path d="M4 13.5V19h16v-5.5h-5a3 3 0 0 1-6 0H4Z" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M19.2 13.6a7.6 7.6 0 0 0 0-3.2l1.8-1.4-1.8-3.1-2.2.8a7.4 7.4 0 0 0-2.8-1.6L13.8 3h-3.6l-.4 2.1A7.4 7.4 0 0 0 7 6.7l-2.2-.8L3 9l1.8 1.4a7.6 7.6 0 0 0 0 3.2L3 15l1.8 3.1 2.2-.8a7.4 7.4 0 0 0 2.8 1.6l.4 2.1h3.6l.4-2.1a7.4 7.4 0 0 0 2.8-1.6l2.2.8L21 15l-1.8-1.4Z" />
    </Svg>
  ),
  collapse: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9 4.5v15" />
      <path d="m15 10-2 2 2 2" />
    </Svg>
  ),
  expand: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9 4.5v15" />
      <path d="m13 10 2 2-2 2" />
    </Svg>
  ),
  menu: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 8h15M4.5 16h15" />
    </Svg>
  ),
  close: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  arrowRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  arrowLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  ),
  users: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17 14a5.5 5.5 0 0 1 3.5 5" />
    </Svg>
  ),
  award: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="9" r="5" />
      <path d="m9 13.5-1.5 7 4.5-2.5 4.5 2.5-1.5-7" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  chevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </Svg>
  ),
  download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
    </Svg>
  ),
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const Component = icons[name];
  return <Component className={className} />;
}

/**
 * โลโก้ระบบ: สัญลักษณ์สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม (สีขาว) บนกรอบสีเขียว — ใช้ที่เล็ก เช่น มุมบนซ้าย
 * โลโก้เต็มพร้อมชื่อสโมสรอยู่ที่ components/brand/StaffClubLogo
 */
export function LogoMark({ className = 'size-9' }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="10" className="fill-matcha-800" />
      <svg x="4" y="4" width="32" height="32" viewBox={MARK_VIEWBOX}>
        <path d={MARK_PATH} fillRule="evenodd" className="fill-washi" />
      </svg>
    </svg>
  );
}
