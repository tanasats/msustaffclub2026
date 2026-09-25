interface AvatarProps {
  name: string | null;
  email: string;
  pictureUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'size-9 text-sm', md: 'size-11 text-base', lg: 'size-16 text-xl' };

// รูปโปรไฟล์จาก Google หรืออักษรย่อบนพื้นมัทฉะอ่อน
export function Avatar({ name, email, pictureUrl, size = 'md' }: AvatarProps) {
  const initial = (name ?? email).trim().charAt(0).toUpperCase();
  if (pictureUrl) {
    return (
      // ใช้ <img> ธรรมดา: รูปจาก Google เล็กอยู่แล้ว และ no-referrer ป้องกัน Google ปฏิเสธรูป
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pictureUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-1 ring-ink/10`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-matcha-100 font-serif text-matcha-800 ring-1 ring-matcha-200`}
    >
      {initial}
    </span>
  );
}
