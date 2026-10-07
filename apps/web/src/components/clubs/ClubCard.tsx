import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/icons';
import { ClubLogo } from './ClubLogo';
import type { ClubListItem } from '@/lib/club-types';
import { bangkokToday } from '@/lib/thai-date';

// การ์ดชมรมที่ดำเนินการอยู่ (Bento) — เด่นกว่าการ์ดระหว่างขอจัดตั้ง: แถบสีหลักด้านบน ตราใหญ่ และเงาเมื่อชี้
export function ClubCard({ club }: { club: ClubListItem }) {
  return (
    <Link
      href={`/clubs/${club.id}`}
      className="bento group relative flex h-full flex-col justify-between gap-5 overflow-hidden p-5 pt-6 shadow-sm shadow-ink/5 transition hover:border-matcha-300 hover:shadow-md sm:p-6 sm:pt-7"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-matcha-700" />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="matcha">{club.category.nameTh}</Badge>
          {club.myMembershipStatus === 'active' && <Badge tone="kin">สมาชิก</Badge>}
          {club.myMembershipStatus === 'pending' && <Badge tone="sky">รออนุมัติสมาชิก</Badge>}
          {club.renewalPending && <Badge tone="sky">ระหว่างต่ออายุ</Badge>}
          {club.registeredUntil < bangkokToday() && !club.renewalPending && <Badge tone="beni">ทะเบียนหมดอายุ</Badge>}
        </div>
        <div className="mt-4 flex items-start gap-4">
          <ClubLogo path={`/clubs/${club.id}/logo`} fileId={club.logoFileId} name={club.nameTh} size="lg" />
          <div className="min-w-0">
            <h2 className="font-serif text-xl leading-snug font-medium text-ink group-hover:text-matcha-800">{club.nameTh}</h2>
            <p className="mt-1 text-sm text-stone">ประธาน: {club.presidentName ?? '—'}</p>
            {club.motto && <p className="mt-1 text-sm text-stone">“{club.motto}”</p>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ink/[0.06] pt-4 text-sm font-medium text-matcha-800">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="users" className="size-4" />
          สมาชิก {club.memberCount.toLocaleString('th-TH')} คน
        </span>
        <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5 group-hover:text-matcha-700" />
      </div>
    </Link>
  );
}
