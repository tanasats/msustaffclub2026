'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LEVEL_OPTIONS } from '@/lib/achievement-types';
import { apiGetClient, apiSend } from '@/lib/api-client';
import { MEDAL_LABELS, type Athlete, type ClubSport, type CompetitionDetail, type Medal, type StatDefinition } from '@/lib/sport-types';

interface CompetitionFormProps {
  clubId: string;
  sports: ClubSport[];
  // นักกีฬาปัจจุบันของชมรม (ทุกชนิดกีฬา) — ฟอร์มกรองตามชนิดกีฬาที่เลือก
  athletes: Athlete[];
  competition: CompetitionDetail | null;
  today: string;
}

interface Row {
  selected: boolean;
  rank: string;
  medal: Medal | '';
  // statId → ค่า (ข้อความในช่อง)
  stats: Record<string, string>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

// บันทึก/แก้ไขการแข่งขัน พร้อมผลรายบุคคลและค่าสถิติ (ผู้มีสิทธิ์ชมรม club_sport:manage — API ตรวจซ้ำ)
export function CompetitionForm({ clubId, sports, athletes, competition, today }: CompetitionFormProps) {
  const router = useRouter();
  const [sportId, setSportId] = useState(competition?.sportId ?? sports[0]?.sportId ?? '');
  const [title, setTitle] = useState(competition?.title ?? '');
  const [eventName, setEventName] = useState(competition?.eventName ?? '');
  const [level, setLevel] = useState<string>(competition?.level ?? 'university');
  const [format, setFormat] = useState<'individual' | 'team'>(competition?.format ?? 'individual');
  const [heldFrom, setHeldFrom] = useState(competition?.heldFrom ?? today);
  const [heldTo, setHeldTo] = useState(competition?.heldTo ?? '');
  const [location, setLocation] = useState(competition?.location ?? '');
  const [organizer, setOrganizer] = useState(competition?.organizer ?? '');
  const [note, setNote] = useState(competition?.note ?? '');
  const [statDefs, setStatDefs] = useState<StatDefinition[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      (competition?.results ?? []).map((r) => [
        r.userId,
        {
          selected: true,
          rank: r.rank?.toString() ?? '',
          medal: r.medal ?? '',
          stats: Object.fromEntries((r.stats ?? []).map((s) => [s.statId, s.value.toString()])),
        },
      ]),
    ),
  );
  // แบบทีม: อันดับ/เหรียญเดียวใช้กับทุกคนในทีม
  const [teamRank, setTeamRank] = useState(competition?.format === 'team' ? (competition.results[0]?.rank?.toString() ?? '') : '');
  const [teamMedal, setTeamMedal] = useState<Medal | ''>(competition?.format === 'team' ? (competition.results[0]?.medal ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // โหลดค่าสถิติของชนิดกีฬาที่เลือก
  useEffect(() => {
    if (!sportId) return;
    let cancelled = false;
    apiGetClient<{ items: StatDefinition[] }>(`/sports/${sportId}/stats`).then((data) => {
      if (!cancelled) setStatDefs((data?.items ?? []).filter((s) => s.isActive));
    });
    return () => {
      cancelled = true;
    };
  }, [sportId]);

  const sportAthletes = athletes.filter((a) => a.sportId === sportId);
  const rowOf = (userId: string): Row => rows[userId] ?? { selected: false, rank: '', medal: '', stats: {} };
  const update = (userId: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [userId]: { ...rowOf(userId), ...patch } }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const results = sportAthletes
      .filter((a) => rowOf(a.userId).selected)
      .map((a) => {
        const row = rowOf(a.userId);
        const rank = format === 'team' ? teamRank : row.rank;
        const medal = format === 'team' ? teamMedal : row.medal;
        return {
          userId: a.userId,
          rank: rank ? Number(rank) : null,
          medal: medal || null,
          stats: statDefs
            .filter((d) => row.stats[d.id]?.trim())
            .map((d) => ({ statId: d.id, value: Number(row.stats[d.id]) })),
        };
      });
    const body = {
      sportId,
      title,
      eventName: eventName || null,
      level,
      format,
      heldFrom,
      heldTo: heldTo || null,
      location: location || null,
      organizer: organizer || null,
      note: note || null,
      results,
    };
    const result = competition
      ? await apiSend('PUT', `/competitions/${competition.id}`, body)
      : await apiSend('POST', `/clubs/${clubId}/competitions`, body);
    setSaving(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    router.push(`/competitions/${competition ? competition.id : (result.data as { id: string }).id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="ชนิดกีฬา *">
          <select value={sportId} onChange={(e) => setSportId(e.target.value)} className="field">
            {sports.map((s) => (
              <option key={s.sportId} value={s.sportId}>
                {s.nameTh}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ชื่อรายการแข่งขัน *" className="sm:col-span-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} placeholder="เช่น กีฬาบุคลากรมหาวิทยาลัยแห่งประเทศไทย ครั้งที่ ..." className="field" />
        </Field>
        <Field label="ประเภท / รุ่น">
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={200} placeholder="เช่น ชายเดี่ยว, 10 กม. อายุ 40+" className="field" />
        </Field>
        <Field label="ระดับ *">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="field">
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="รูปแบบ *">
          <select value={format} onChange={(e) => setFormat(e.target.value as 'individual' | 'team')} className="field">
            <option value="individual">เดี่ยว (ผลรายบุคคล)</option>
            <option value="team">ทีม (ผลเดียวกันทั้งทีม)</option>
          </select>
        </Field>
        <Field label="วันที่แข่ง *">
          <input type="date" value={heldFrom} onChange={(e) => setHeldFrom(e.target.value)} required max={today} className="field" />
        </Field>
        <Field label="ถึงวันที่ (ถ้าหลายวัน)">
          <input type="date" value={heldTo} onChange={(e) => setHeldTo(e.target.value)} min={heldFrom} className="field" />
        </Field>
        <Field label="สถานที่">
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} className="field" />
        </Field>
        <Field label="ผู้จัด" className="sm:col-span-3">
          <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} maxLength={300} className="field" />
        </Field>
      </div>

      {format === 'team' && (
        <div className="grid gap-3 rounded-xl border border-ink/[0.08] bg-cream p-3 sm:grid-cols-2">
          <Field label="อันดับของทีม">
            <input type="number" min={1} value={teamRank} onChange={(e) => setTeamRank(e.target.value)} className="field" />
          </Field>
          <Field label="เหรียญของทีม">
            <select value={teamMedal} onChange={(e) => setTeamMedal(e.target.value as Medal | '')} className="field">
              <option value="">— ไม่มี —</option>
              {Object.entries(MEDAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">ผู้เข้าแข่งขันและผล ({sportAthletes.filter((a) => rowOf(a.userId).selected).length} คน)</legend>
        {sportAthletes.length === 0 ? (
          <p className="text-sm text-stone">ยังไม่มีนักกีฬาของชนิดกีฬานี้ในชมรม</p>
        ) : (
          <ul className="grid gap-2">
            {sportAthletes.map((a) => {
              const row = rowOf(a.userId);
              return (
                <li key={a.id} className={`grid gap-2 rounded-xl border p-3 ${row.selected ? 'border-matcha-300' : 'border-ink/[0.08]'}`}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={row.selected} onChange={(e) => update(a.userId, { selected: e.target.checked })} className="size-4 accent-matcha-700" />
                    <span className="font-medium">{a.name ?? a.email}</span>
                    {a.eventOrPosition && <span className="text-stone">· {a.eventOrPosition}</span>}
                  </label>
                  {row.selected && (
                    <div className="grid gap-2 sm:grid-cols-4">
                      {format === 'individual' && (
                        <>
                          <input type="number" min={1} value={row.rank} onChange={(e) => update(a.userId, { rank: e.target.value })} placeholder="อันดับ" aria-label={`อันดับของ ${a.name ?? a.email}`} className="field !min-h-10 text-sm" />
                          <select value={row.medal} onChange={(e) => update(a.userId, { medal: e.target.value as Medal | '' })} aria-label={`เหรียญของ ${a.name ?? a.email}`} className="field !min-h-10 text-sm">
                            <option value="">— ไม่มีเหรียญ —</option>
                            {Object.entries(MEDAL_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {statDefs.map((d) => (
                        <input
                          key={d.id}
                          type="number"
                          step="any"
                          value={row.stats[d.id] ?? ''}
                          onChange={(e) => update(a.userId, { stats: { ...row.stats, [d.id]: e.target.value } })}
                          placeholder={`${d.nameTh}${d.unit ? ` (${d.unit})` : ''}`}
                          aria-label={`${d.nameTh} ของ ${a.name ?? a.email}`}
                          className="field !min-h-10 text-sm"
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-mist">อันดับ/เหรียญเป็นข้อมูลสาธารณะ ค่าสถิติรายบุคคลเห็นเฉพาะตัวนักกีฬาและกรรมการชมรม</p>
      </fieldset>

      <Field label="หมายเหตุ">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className="field" />
      </Field>
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !sportId} className="btn btn-primary">
          {saving ? 'กำลังบันทึก...' : competition ? 'บันทึกการแก้ไข' : 'บันทึกการแข่งขัน'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
