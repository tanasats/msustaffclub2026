import { redirect } from 'next/navigation';
import { CompetitionForm } from '@/components/sports/CompetitionForm';
import { Bento } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import type { Athlete, ClubSport, CompetitionDetail } from '@/lib/sport-types';
import { bangkokToday } from '@/lib/thai-date';

// แก้ไขการแข่งขัน (สิทธิ์ชมรม club_sport:manage — API ตรวจซ้ำ)
export default async function EditCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await apiGetJson<CompetitionDetail>(`/competitions/${encodeURIComponent(id)}`);
  if (!competition.me.canManage) redirect(`/competitions/${competition.id}`);
  const [sports, athletes] = await Promise.all([
    apiGetJson<{ items: ClubSport[] }>(`/clubs/${competition.clubId}/sports`),
    apiGetJson<{ items: Athlete[] }>(`/clubs/${competition.clubId}/athletes`),
  ]);
  return (
    <>
      <PageHeader eyebrow="Competition" title="แก้ไขการแข่งขัน" description={competition.title} back={{ href: `/competitions/${competition.id}`, label: competition.title }} />
      <Bento>
        <CompetitionForm clubId={competition.clubId} sports={sports.items} athletes={athletes.items} competition={competition} today={bangkokToday()} />
      </Bento>
    </>
  );
}
