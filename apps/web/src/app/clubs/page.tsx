import Link from 'next/link';
import { ClubCard } from '@/components/clubs/ClubCard';
import { ProposedClubCard } from '@/components/clubs/ProposedClubCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ClubCategory } from '@/lib/club-application-types';
import type { ClubListItem, ProposedClubItem } from '@/lib/club-types';

const PAGE_SIZE = 24;
// จำนวนการ์ด "ระหว่างขอจัดตั้ง" ที่แสดงในแท็บทั้งหมด (ที่เหลือดูในแท็บของมันเอง)
const PROPOSED_PREVIEW = 6;

// all = ดำเนินการอยู่ + ระหว่างขอจัดตั้ง, active = ชมรมที่ดำเนินการอยู่ (รวมที่กำลังต่ออายุ),
// renewing = มีคำขอต่อทะเบียนที่ยื่นแล้ว, proposed = คำขอจัดตั้งที่ยื่นแล้ว, mine = ชมรมของฉัน
const VIEWS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'active', label: 'ดำเนินการอยู่' },
  { value: 'renewing', label: 'ระหว่างต่ออายุ' },
  { value: 'proposed', label: 'ระหว่างขอจัดตั้ง' },
  { value: 'mine', label: 'ชมรมของฉัน' },
] as const;
type View = (typeof VIEWS)[number]['value'];

interface SearchParams {
  q?: string;
  category?: string;
  view?: string;
  // ลิงก์เดิม ?mine=1 ยังใช้ได้
  mine?: string;
  page?: string;
}

interface Page<T> {
  items: T[];
  total: number;
}

export default async function ClubsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view: View = params.mine === '1' ? 'mine' : (VIEWS.find((v) => v.value === params.view)?.value ?? 'all');
  const page = Math.max(1, Number(params.page) || 1);
  const filter = new URLSearchParams();
  if (params.q?.trim()) filter.set('q', params.q.trim());
  if (params.category) filter.set('category', params.category);

  const clubQuery = new URLSearchParams(filter);
  clubQuery.set('page', String(page));
  clubQuery.set('pageSize', String(PAGE_SIZE));
  if (view === 'mine') clubQuery.set('mine', '1');
  if (view === 'renewing') clubQuery.set('renewing', '1');
  const proposedQuery = new URLSearchParams(filter);
  proposedQuery.set('page', view === 'proposed' ? String(page) : '1');
  proposedQuery.set('pageSize', String(view === 'proposed' ? PAGE_SIZE : PROPOSED_PREVIEW));

  const [clubs, proposed, categories] = await Promise.all([
    view === 'proposed' ? null : apiGetJson<Page<ClubListItem>>(`/clubs?${clubQuery}`),
    view === 'all' || view === 'proposed' ? apiGetJson<Page<ProposedClubItem>>(`/clubs/proposed?${proposedQuery}`) : null,
    apiGetJson<{ items: ClubCategory[] }>('/club-categories'),
  ]);
  const listTotal = (view === 'proposed' ? proposed?.total : clubs?.total) ?? 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  // สร้างลิงก์โดยคงตัวกรองเดิม แล้วเปลี่ยนเฉพาะค่าที่ระบุ
  const link = (changes: Partial<SearchParams>) => {
    const next = { q: params.q, category: params.category, view: view === 'all' ? undefined : view, ...changes };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/clubs${qs.size ? `?${qs}` : ''}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition ${
      active ? 'border-matcha-800 bg-matcha-800 text-washi' : 'border-ink/[0.12] bg-white text-stone hover:border-matcha-300 hover:text-matcha-800'
    }`;
  const showProposedSection = view === 'all' && page === 1 && proposed && proposed.items.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Club Directory"
        title="ทำเนียบชมรม"
        description="ชมรมบุคลากรที่ดำเนินการอยู่ ระหว่างต่ออายุ และระหว่างขอจัดตั้ง — ค้นหาและดูรายละเอียดของแต่ละชมรม"
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="สถานะชมรม">
          {VIEWS.map((v) => (
            <Link key={v.value} href={link({ view: v.value === 'all' ? undefined : v.value, page: undefined })} role="tab" aria-selected={view === v.value} className={chip(view === v.value)}>
              {v.label}
            </Link>
          ))}
        </div>
        <form action="/clubs" className="flex flex-col gap-2 sm:flex-row">
          {view !== 'all' && <input type="hidden" name="view" value={view} />}
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

      {showProposedSection && (
        <section className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-lg font-medium text-ink">ระหว่างขอจัดตั้ง ({proposed.total})</h2>
            {proposed.total > proposed.items.length && (
              <Link href={link({ view: 'proposed', page: undefined })} className="text-sm text-matcha-700 underline">
                ดูทั้งหมด
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {proposed.items.map((club) => (
              <li key={club.id}>
                <ProposedClubCard club={club} />
              </li>
            ))}
          </ul>
          <h2 className="mt-6 font-serif text-lg font-medium text-ink">ชมรมที่ดำเนินการอยู่ ({clubs?.total ?? 0})</h2>
        </section>
      )}

      {view === 'proposed' ? (
        !proposed || proposed.items.length === 0 ? (
          <EmptyState icon="scroll" title="ไม่มีชมรมที่อยู่ระหว่างขอจัดตั้ง" description="ชมรมจะแสดงที่นี่เมื่อผู้ยื่นส่งคำขอจัดตั้งต่อสโมสรแล้ว" />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {proposed.items.map((club) => (
              <li key={club.id}>
                <ProposedClubCard club={club} />
              </li>
            ))}
          </ul>
        )
      ) : !clubs || clubs.items.length === 0 ? (
        <EmptyState
          icon="users"
          title={
            view === 'mine' ? 'คุณยังไม่ได้เป็นสมาชิกชมรมใด' : view === 'renewing' ? 'ไม่มีชมรมที่อยู่ระหว่างต่ออายุ' : 'ไม่พบชมรมที่ตรงกับเงื่อนไข'
          }
          description={view === 'mine' ? 'ดูทำเนียบชมรมทั้งหมดเพื่อเลือกชมรมที่สนใจ' : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {clubs.items.map((club) => (
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
