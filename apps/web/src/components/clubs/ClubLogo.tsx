import { publicEnv } from '@/lib/public-env';

const SIZES = {
  sm: 'size-12 text-lg',
  md: 'size-16 text-2xl',
  lg: 'size-24 text-4xl',
} as const;

interface ClubLogoProps {
  // path ของรูปที่ API เช่น /clubs/{id}/logo (API ตรวจ login แล้ว redirect ไป URL อายุสั้น)
  path: string;
  // id ไฟล์ตรา (null = ยังไม่มีตรา แสดงอักษรแทน) ใส่ใน query เพื่อให้ browser โหลดรูปใหม่เมื่อเปลี่ยนตรา
  fileId: string | null;
  name: string;
  size?: keyof typeof SIZES;
}

// ตราสัญลักษณ์ชมรม: ไม่มีตรา → วงกลมอักษรตัวแรกของชื่อ (ตัด "ชมรม" ออก)
export function ClubLogo({ path, fileId, name, size = 'md' }: ClubLogoProps) {
  const box = `${SIZES[size]} shrink-0 rounded-2xl border border-ink/[0.08]`;
  if (!fileId) {
    const initial = name.replace(/^ชมรม/, '').trim().charAt(0) || name.charAt(0);
    return (
      <span aria-hidden="true" className={`${box} inline-flex items-center justify-center bg-matcha-50 font-serif text-matcha-700`}>
        {initial}
      </span>
    );
  }
  return (
    // ใช้ <img> ธรรมดา: รูปมาจาก API (redirect ไป storage ที่ต้องใช้ cookie) next/image ปรับขนาดผ่าน server ของ Next ไม่ได้
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${publicEnv.apiUrl}${path}?v=${fileId}`}
      alt={`ตราสัญลักษณ์${name}`}
      loading="lazy"
      className={`${box} bg-white object-contain p-1`}
    />
  );
}
