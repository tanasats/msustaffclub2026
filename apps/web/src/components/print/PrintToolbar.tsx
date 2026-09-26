'use client';

import Link from 'next/link';

// แถบเครื่องมือเหนือเอกสาร (ไม่พิมพ์): กลับ + พิมพ์/บันทึกเป็น PDF ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์
export function PrintToolbar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={backHref} className="text-sm text-stone underline">
        ← {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-stone">ในหน้าต่างพิมพ์ เลือกปลายทาง “บันทึกเป็น PDF” ขนาดกระดาษ A4</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primary !min-h-10 text-sm">
          พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>
    </div>
  );
}
