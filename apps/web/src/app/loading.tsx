// โครงร่างระหว่างโหลด (skeleton แบบ Bento)
export default function Loading() {
  return (
    <div role="status" aria-label="กำลังโหลดข้อมูล" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      <div className="h-48 animate-pulse rounded-bento bg-matcha-100/60 sm:col-span-2 lg:row-span-2 lg:h-auto" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-bento border border-ink/[0.06] bg-white/60" />
      ))}
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
    </div>
  );
}
