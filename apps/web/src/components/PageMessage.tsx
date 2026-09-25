import { LogoMark } from '@/components/ui/icons';

interface PageMessageProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

// กล่องข้อความกลางหน้า ใช้ร่วมกันใน error / not-found / ไม่มีสิทธิ์
export function PageMessage({ title, description, children }: PageMessageProps) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="bento flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
        <LogoMark className="mb-2 size-12" />
        <h1 className="font-serif text-2xl font-medium">{title}</h1>
        {description && <p className="text-[15px] leading-relaxed text-stone">{description}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
