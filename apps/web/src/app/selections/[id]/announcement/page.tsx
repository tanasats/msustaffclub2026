import { Badge } from '@/components/ui/Badge';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';
import { KIND_LABELS, type Announcement } from '@/lib/selection-types';

// ประกาศผลการคัดเลือก (ต้อง login เท่านั้น เฉพาะรอบที่ปิดแล้ว — ไม่แสดงตัวชี้วัดและผู้ไม่ได้รับคัดเลือก)
export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await apiGetJson<Announcement>(`/selection-rounds/${encodeURIComponent(id)}/announcement`);
  const groups = [
    ['selected', 'ผู้ได้รับคัดเลือก'],
    ['reserve', 'สำรอง'],
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="Announcement"
        title={a.title}
        description={[KIND_LABELS[a.kind], a.sportName, a.eventName, `ปีงบประมาณ ${a.fiscalYear}`, `ประกาศ ${formatDateTime(a.closedAt)}`].filter(Boolean).join(' · ')}
        back={{ href: '/announcements', label: 'ประกาศผลคัดเลือก' }}
      />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {groups.map(([decision, label]) => {
          const list = a.results.filter((r) => r.decision === decision);
          return (
            <Bento key={decision} tone={decision === 'selected' ? 'paper' : 'cream'}>
              <BentoTitle className="mb-3">
                {label} ({list.length} คน)
              </BentoTitle>
              {list.length === 0 ? (
                <p className="text-sm text-stone">—</p>
              ) : (
                <ol className="grid gap-2">
                  {list.map((r, i) => (
                    <li key={r.userId} className="rounded-xl border border-ink/[0.08] p-3 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {i + 1}. {r.name}
                        {r.clubs.map((c) => (
                          <Badge key={c} tone="neutral">
                            {c}
                          </Badge>
                        ))}
                      </p>
                      <p className="mt-1 text-stone">{r.reason}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Bento>
          );
        })}
      </div>
      {a.criteria && <p className="mt-4 text-sm whitespace-pre-line text-stone">เกณฑ์การพิจารณา: {a.criteria}</p>}
    </>
  );
}
