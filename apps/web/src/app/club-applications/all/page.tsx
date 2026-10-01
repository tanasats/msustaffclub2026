import Link from 'next/link';
import { ApplicationList } from '@/components/club-applications/ApplicationList';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { STATUS_LABELS, type ApplicationListItem, type ApplicationStatus } from '@/lib/club-application-types';

const PAGE_SIZE = 30;
const STATUSES = Object.keys(STATUS_LABELS) as ApplicationStatus[];

interface SearchParams {
  status?: string;
  type?: string;
  q?: string;
  page?: string;
}

interface AllApplications {
  items: ApplicationListItem[];
  total: number;
  byStatus: Partial<Record<ApplicationStatus, number>>;
}

// คำขอทุกสถานะเพื่อกำกับติดตาม (API ต้องมี club:read_all — super_admin ผ่าน, ไม่มีสิทธิ์ → หน้าไม่มีสิทธิ์)
export default async function AllApplicationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status as ApplicationStatus) ? (params.status as ApplicationStatus) : undefined;
  const type = params.type === 'establish' || params.type === 'renewal' ? params.type : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (type) query.set('type', type);
  if (params.q?.trim()) query.set('q', params.q.trim());

  const data = await apiGetJson<AllApplications>(`/club-applications/all?${query}`);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const allCount = Object.values(data.byStatus).reduce((sum, n) => sum + (n ?? 0), 0);
  // สร้างลิงก์โดยคงตัวกรองเดิม แล้วเปลี่ยนเฉพาะค่าที่ระบุ
  const link = (changes: Partial<SearchParams>) => {
    const next = { status, type, q: params.q, ...changes };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/club-applications/all${qs.size ? `?${qs}` : ''}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap transition ${
      active ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.12] bg-white text-stone hover:border-matcha-300 hover:text-matcha-800'
    }`;

  return (
    <>
      <PageHeader
        eyebrow="All Applications"
        title="คำขอทั้งหมด"
        description="คำขอจัดตั้งและต่อทะเบียนชมรมทุกสถานะ (รวมฉบับร่างและที่ยกเลิก) เรียงจากที่มีความเคลื่อนไหวล่าสุด — เปิดดูรายละเอียดได้ทุกคำขอ"
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="สถานะคำขอ">
          <Link href={link({ status: undefined, page: undefined })} role="tab" aria-selected={!status} className={chip(!status)}>
            ทุกสถานะ <span>{allCount}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={link({ status: s, page: undefined })} role="tab" aria-selected={status === s} className={chip(status === s)}>
              {STATUS_LABELS[s]} <span>{data.byStatus[s] ?? 0}</span>
            </Link>
          ))}
        </div>
        <form action="/club-applications/all" className="flex flex-col gap-2 sm:flex-row">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="type" defaultValue={type ?? ''} aria-label="ประเภทคำขอ" className="field sm:max-w-48">
            <option value="">ทุกประเภท</option>
            <option value="establish">จัดตั้งชมรม</option>
            <option value="renewal">ต่อทะเบียน</option>
          </select>
          <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="ค้นหาชื่อชมรม หรือชื่อ/อีเมลผู้ยื่น" aria-label="ค้นหา" className="field" />
          <button type="submit" className="btn btn-primary shrink-0">
            <Icon name="search" className="size-[1.125rem]" />
            ค้นหา
          </button>
        </form>
        <p className="text-sm text-stone">พบ {data.total} คำขอ</p>
      </div>

      <ApplicationList items={data.items} emptyMessage="ไม่พบคำขอที่ตรงกับเงื่อนไข" />

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="เปลี่ยนหน้า">
          {page > 1 ? <Link href={link({ page: String(page - 1) })} className="btn btn-secondary">← ก่อนหน้า</Link> : <span />}
          <span className="text-stone">หน้า {page} / {totalPages}</span>
          {page < totalPages ? <Link href={link({ page: String(page + 1) })} className="btn btn-secondary">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
