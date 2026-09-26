// ส่วนประกอบร่วมของเอกสารสำหรับพิมพ์ (A4) — ใช้กับ .doc-page ใน globals.css

export const DOTS = '....................................';

// ช่องกรอก: มีค่า → แสดงค่า, ไม่มี → เส้นประให้เขียนเอง
export function Fill({ value, dots = DOTS }: { value: string | null | undefined; dots?: string }) {
  return value ? <span className="font-bold">{value}</span> : <span>{dots}</span>;
}

// เส้นลงนาม (ลงนามด้วยมือ) พร้อมชื่อในวงเล็บ และหมายเหตุการยืนยันในระบบ (ถ้ามี)
export function Signature({ name, role, note }: { name: string | null; role: string; note?: string | null }) {
  return (
    <div className="text-center">
      <p>ลงชื่อ.....................................................</p>
      <p>( {name ?? '.............................................'} )</p>
      <p>{role}</p>
      {note && <p className="text-[11pt] text-neutral-600">{note}</p>}
    </div>
  );
}

export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`doc-page ${className}`}>{children}</section>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-center font-bold">{children}</h2>;
}

// ป้ายฉบับร่าง (รายงานที่ยังไม่ได้ส่ง) — พิมพ์ติดไปด้วยเพื่อไม่ให้สับสนกับฉบับจริง
export function DraftMark({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mb-2 text-right text-[12pt] font-bold">(ฉบับร่าง — ยังไม่ได้ส่งในระบบ)</p>;
}
