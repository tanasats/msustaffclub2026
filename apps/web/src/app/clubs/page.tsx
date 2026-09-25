import Link from 'next/link';
import { ClubCard } from '@/components/clubs/ClubCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ClubCategory } from '@/lib/club-application-types';
import type { ClubListItem } from '@/lib/club-types';

const PAGE_SIZE = 24;

interface SearchParams {
  q?: string;
  category?: string;
  mine?: string;
  page?: string;
}

export default async function ClubsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const mine = params.mine === '1';
  const page = Math.max(1, Number(params.page) || 1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.category) query.set('category', params.category);
  if (mine) query.set('mine', '1');

  const [data, categories] = await Promise.all([
    apiGetJson<{ items: ClubListItem[]; total: number }>(`/clubs?${query}`),
    apiGetJson<{ items: ClubCategory[] }>('/club-categories'),
  ]);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  // สร้างลิงก์โดยคงตัวกรองเดิม แล้วเปลี่ยนเฉพาะค่าที่ระบุ
  const link = (changes: Partial<SearchParams>) => {
    const next = { q: params.q, category: params.category, mine: params.mine, ...changes };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/clubs${qs.size ? `?${qs}` : ''}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition ${
      active ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.12] bg-white text-stone hover:border-matcha-300 hover:text-matcha-800'
    }`;

  return (
    <>
      <PageHeader eyebrow="Club Directory" title="ทำเนียบชมรม" description="ชมรมบุคลากรที่ดำเนินการอยู่ทั้งหมด — ค้นหาและดูรายละเอียดของแต่ละชมรม" />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="มุมมอง">
          <Link href={link({ mine: undefined, page: undefined })} role="tab" aria-selected={!mine} className={chip(!mine)}>
            ทั้งหมด
          </Link>
          <Link href={link({ mine: '1', page: undefined })} role="tab" aria-selected={mine} className={chip(mine)}>
            ชมรมของฉัน
          </Link>
        </div>
        <form action="/clubs" className="flex flex-col gap-2 sm:flex-row">
          {mine && <input type="hidden" name="mine" value="1" />}
          {params.category && <input type="hidden" name="category" value={params.category} />}
          <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="ค้นหาชื่อชมรม" aria-label="ค้นหาชื่อชมรม" className="field" />
          <button type="submit" className="btn btn-primary shrink-0">
            <Icon name="search" className="size-[1.125rem]" />
            ค้นหา
          </button>
        </form>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="ประเภทชมรม">
          <Link href={link({ category: undefined, page: undefined })} className={chip(!params.category)}>
            ทุกประเภท
          </Link>
          {categories.items.map((category) => (
            <Link key={category.code} href={link({ category: category.code, page: undefined })} className={chip(params.category === category.code)}>
              {category.nameTh}
            </Link>
          ))}
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon="users"
          title={mine ? 'คุณยังไม่ได้เป็นสมาชิกชมรมใด' : 'ไม่พบชมรมที่ตรงกับเงื่อนไข'}
          description={mine ? 'ดูทำเนียบชมรมทั้งหมดเพื่อเลือกชมรมที่สนใจ' : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {data.items.map((club) => (
            <li key={club.id}>
              <ClubCard club={club} />
            </li>
          ))}
        </ul>
      )}

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
