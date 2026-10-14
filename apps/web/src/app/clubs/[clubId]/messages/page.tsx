import { redirect } from 'next/navigation';
import { BroadcastForm } from '@/components/broadcasts/BroadcastForm';
import { BroadcastHistory } from '@/components/broadcasts/BroadcastHistory';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { BroadcastPage } from '@/lib/broadcast-types';
import type { ClubPage } from '@/lib/club-types';

// ส่งข้อความถึงสมาชิกชมรม — สิทธิ์ชมรม club_message:send (กรรมการทุกตำแหน่ง) ซ่อนหน้าเพื่อ UX API ตรวจซ้ำ
export default async function ClubMessagesPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await apiGetJson<ClubPage>(`/clubs/${encodeURIComponent(clubId)}`);
  if (!club.me.permissions.includes('club_message:send')) redirect('/forbidden');
  const history = await apiGetJson<BroadcastPage>(`/clubs/${club.id}/messages`);

  return (
    <>
      <PageHeader
        eyebrow="Club"
        title="ส่งข้อความถึงสมาชิก"
        description={`${club.nameTh} — ข้อความแสดงที่กระดิ่งในระบบของสมาชิก และส่งทางอีเมลถึงผู้ที่เปิดรับ`}
        back={{ href: `/clubs/${club.id}`, label: club.nameTh }}
      />
      <div className="grid gap-3 sm:gap-4">
        <Bento>
          <BentoTitle className="mb-4">เขียนข้อความ</BentoTitle>
          <BroadcastForm mode="club" clubId={club.id} />
        </Bento>
        <Bento>
          <BentoTitle className="mb-3">ข้อความที่ส่งแล้ว ({history.total.toLocaleString('th-TH')})</BentoTitle>
          <BroadcastHistory items={history.items} />
        </Bento>
      </div>
    </>
  );
}
