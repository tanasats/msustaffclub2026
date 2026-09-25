import Link from 'next/link';
import { Icon } from './icons';

interface PageHeaderProps {
  // ข้อความภาษาอังกฤษสั้น ๆ เหนือหัวข้อ (เว้นระยะตัวอักษรได้ เพราะไม่ใช่ภาษาไทย)
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}

// หัวหน้า: ลิงก์ย้อนกลับ + หัวข้อ serif + คำอธิบาย + ปุ่มด้านขวา
export function PageHeader({ eyebrow, title, description, back, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-8">
      {back && (
        <Link
          href={back.href}
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-stone transition hover:text-matcha-700"
        >
          <Icon name="arrowLeft" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && <p className="mb-2 text-xs font-medium tracking-[0.18em] text-matcha-600 uppercase">{eyebrow}</p>}
          <h1 className="font-serif text-[1.75rem] leading-tight font-medium text-ink sm:text-3xl">{title}</h1>
          {description && <div className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-stone">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
