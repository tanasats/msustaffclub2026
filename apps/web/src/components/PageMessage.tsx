interface PageMessageProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

// กล่องข้อความกลางหน้า ใช้ร่วมกันใน loading / error / empty / ไม่มีสิทธิ์
export function PageMessage({ title, description, children }: PageMessageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      {description && <p className="text-slate-600">{description}</p>}
      {children}
    </main>
  );
}
