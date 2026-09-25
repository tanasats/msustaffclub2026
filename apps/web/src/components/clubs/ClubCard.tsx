import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/icons';
import type { ClubListItem } from '@/lib/club-types';

// การ์ดชมรมในทำเนียบ (Bento)
export function ClubCard({ club }: { club: ClubListItem }) {
  return (
    <Link href={`/clubs/${club.id}`} className="bento group flex h-full flex-col justify-between gap-5 p-5 transition hover:border-matcha-300 sm:p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="matcha">{club.category.nameTh}</Badge>
          {club.myMembershipStatus === 'active' && <Badge tone="kin">สมาชิก</Badge>}
          {club.myMembershipStatus === 'pending' && <Badge tone="sky">รออนุมัติสมาชิก</Badge>}
        </div>
        <h2 className="mt-3 font-serif text-xl leading-snug font-medium text-ink group-hover:text-matcha-800">{club.nameTh}</h2>
        {club.motto && <p className="mt-1 text-sm text-stone">“{club.motto}”</p>}
      </div>
      <div className="flex items-center justify-between text-sm text-stone">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="users" className="size-4" />
          สมาชิก {club.memberCount.toLocaleString('th-TH')} คน
        </span>
        <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5 group-hover:text-matcha-700" />
      </div>
    </Link>
  );
}
