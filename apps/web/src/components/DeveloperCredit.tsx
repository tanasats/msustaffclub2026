import { DEVELOPER } from '@/lib/site-info';

const linkClass = 'text-matcha-700 underline underline-offset-4 hover:text-matcha-900';

// เครดิตผู้พัฒนา: จอกว้างแสดงบรรทัดเดียว จอแคบ (หรือ stacked) แยก "พัฒนาโดย" กับ "ติดต่อ" คนละบรรทัด
// จุดคั่นแสดงเฉพาะเมื่ออยู่บรรทัดเดียวกัน เพื่อไม่ให้จุดไปขึ้นต้นบรรทัดใหม่
export function DeveloperCredit({ className = '', stacked = false }: { className?: string; stacked?: boolean }) {
  return (
    <p className={`flex flex-col gap-y-1 text-sm text-stone ${stacked ? '' : 'sm:flex-row sm:flex-wrap sm:gap-x-2'} ${className}`}>
      <span>
        พัฒนาโดย {DEVELOPER.name} {DEVELOPER.unit}
      </span>
      {!stacked && (
        <span aria-hidden="true" className="hidden sm:inline">
          ·
        </span>
      )}
      <span className="whitespace-nowrap">
        ติดต่อ โทรภายใน {DEVELOPER.phoneExt} ·{' '}
        <a href={`mailto:${DEVELOPER.email}`} className={linkClass}>
          {DEVELOPER.email}
        </a>
      </span>
    </p>
  );
}

// รายละเอียดผู้พัฒนาและช่องทางติดต่อ (การ์ดในหน้าตั้งค่า)
export function DeveloperContact() {
  return (
    <dl className="grid gap-3 text-[0.9375rem]">
      <div>
        <dt className="text-sm text-stone">ผู้พัฒนาระบบ</dt>
        <dd className="mt-0.5 text-ink">{DEVELOPER.name}</dd>
        <dd className="text-sm text-stone">{DEVELOPER.unit}</dd>
      </div>
      <div>
        <dt className="text-sm text-stone">โทรศัพท์ภายใน</dt>
        <dd className="mt-0.5 text-ink">{DEVELOPER.phoneExt}</dd>
      </div>
      <div>
        <dt className="text-sm text-stone">อีเมล</dt>
        <dd className="mt-0.5">
          <a href={`mailto:${DEVELOPER.email}`} className={linkClass}>
            {DEVELOPER.email}
          </a>
        </dd>
      </div>
    </dl>
  );
}
