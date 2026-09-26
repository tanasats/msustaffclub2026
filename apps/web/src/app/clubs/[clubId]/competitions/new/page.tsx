import { redirect } from 'next/navigation';
import { CompetitionForm } from '@/components/sports/CompetitionForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { ClubPage } from '@/lib/club-types';
import type { Athlete, ClubSport } from '@/lib/sport-types';
import { bangkokToday } from '@/lib/thai-date';

// บันทึกการแข่งขัน (สิทธิ์ชมรม club_sport:manage — API ตรวจซ้ำ)
export default async function NewCompetitionPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const id = encodeURIComponent(clubId);
  const club = await apiGetJson<ClubPage>(`/clubs/${id}`);
  if (!club.me.permissions.includes('club_sport:manage') || club.status !== 'active') redirect('/forbidden');
  const [sports, athletes] = await Promise.all([
    apiGetJson<{ items: ClubSport[] }>(`/clubs/${id}/sports`),
    apiGetJson<{ items: Athlete[] }>(`/clubs/${id}/athletes`),
  ]);
  return (
    <>
      <PageHeader eyebrow="Competition" title="บันทึกการแข่งขัน" description={club.nameTh} back={{ href: `/clubs/${club.id}/competitions`, label: 'การแข่งขัน' }} />
      <Bento>
        <CompetitionForm clubId={club.id} sports={sports.items} athletes={athletes.items} competition={null} today={bangkokToday()} />
      </Bento>
    </>
  );
}
