import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/icons';
import { PROPOSED_STATUS_LABELS, type ProposedClubItem } from '@/lib/club-types';
import { formatTimestampDate } from '@/lib/format';
import { ClubLogo } from './ClubLogo';

// การ์ดชมรมที่อยู่ระหว่างขอจัดตั้ง (คำขอที่ยื่นต่อสโมสรแล้ว) — เรียบกว่าการ์ดชมรมที่ดำเนินการอยู่:
// ขอบเส้นประ พื้นสีเดียวกับหน้า ตราเล็ก (สีตัวอักษรยังตัดกันชัดตาม WCAG AA)
export function ProposedClubCard({ club }: { club: ProposedClubItem }) {
  return (
    <Link
      href={`/clubs/proposed/${club.id}`}
      className="group flex h-full flex-col justify-between gap-4 rounded-bento border border-dashed border-ink/25 bg-washi p-4 transition hover:border-matcha-300 hover:bg-white sm:p-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="kin">ระหว่างขอจัดตั้ง</Badge>
          {club.category && <Badge tone="matcha">{club.category.nameTh}</Badge>}
        </div>
        <div className="mt-3 flex items-start gap-3">
          <ClubLogo path={`/clubs/proposed/${club.id}/logo`} fileId={club.logoFileId} name={club.nameTh} size="sm" />
          <div className="min-w-0">
            <h2 className="font-serif text-lg leading-snug font-medium text-ink group-hover:text-matcha-800">{club.nameTh}</h2>
            <p className="mt-1 text-sm text-stone">ประธาน: {club.presidentName ?? '—'}</p>
            {club.motto && <p className="mt-1 text-sm text-stone">“{club.motto}”</p>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-stone">
        <span>
          {PROPOSED_STATUS_LABELS[club.status]}
          {club.submittedAt && ` · ยื่นเมื่อ ${formatTimestampDate(club.submittedAt)}`}
        </span>
        <Icon name="arrowRight" className="size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-matcha-700" />
      </div>
    </Link>
  );
}
