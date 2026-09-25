import { formatDate } from '@/lib/format';
import { ClubLogo } from '@/components/clubs/ClubLogo';
import { RenewalContextPanel } from '@/components/renewals/RenewalContextPanel';
import { FileLink } from '@/components/files/FileLink';
import { Badge } from '@/components/ui/Badge';
import { advisorDisplayName, type ApplicationDetail } from '@/lib/club-application-types';
import { CONSENT_LABELS } from '@/lib/club-application-types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-4 sm:gap-4">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="text-sm sm:col-span-3">{children || '-'}</dd>
    </div>
  );
}

// มุมมองอ่านอย่างเดียว (ที่ปรึกษา / เจ้าหน้าที่ / นายกสโมสร / ผู้ยื่นเมื่อแก้ไม่ได้แล้ว)
export function ApplicationSummary({ application: a }: { application: ApplicationDetail }) {
  return (
    <div className="grid gap-4">
      <section className="bento p-5 sm:p-6">
        <h2 className="font-serif text-lg font-medium">ข้อมูลชมรม</h2>
        <dl className="mt-2 divide-y divide-ink/[0.06]">
          <Row label="ประเภท">
            {a.category?.nameTh}
            {a.categoryDetail ? ` (${a.categoryDetail})` : ''}
          </Row>
          <Row label="วัตถุประสงค์">
            {a.objectives.length > 0 && (
              <ol className="list-decimal pl-5">
                {a.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            )}
          </Row>
          <Row label="คำขวัญ">{a.motto}</Row>
          <Row label="ตราสัญลักษณ์">
            {a.logoFileId && <ClubLogo path={`/club-applications/${a.id}/logo`} fileId={a.logoFileId} name={a.nameTh} />}
          </Row>
          <Row label="ความหมายของตรา">{a.logoMeaning}</Row>
          <Row label="ประวัติชมรม">{a.history && <p className="whitespace-pre-line">{a.history}</p>}</Row>
          <Row label="สถานที่ทำการ">{a.officeLocation}</Row>
          <Row label="ติดต่อ">{[a.contactPhone, a.contactEmail].filter(Boolean).join(' · ')}</Row>
        </dl>
      </section>

      <section className="bento p-5 sm:p-6">
        <h2 className="font-serif text-lg font-medium">ที่ปรึกษาชมรม</h2>
        <ul className="mt-2 grid gap-2 text-sm">
          {a.advisors.map((adv) => (
            <li key={adv.sortOrder} className="rounded-xl border border-ink/[0.08] p-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {adv.sortOrder}. {advisorDisplayName(adv)}
                </span>
                <Badge tone={adv.kind === 'external' ? 'kin' : 'matcha'}>{adv.kind === 'external' ? 'บุคคลภายนอก' : 'บุคลากร มมส.'}</Badge>
                <Badge tone={adv.consentStatus === 'accepted' ? 'matcha' : adv.consentStatus === 'declined' ? 'beni' : 'neutral'}>
                  {adv.kind === 'external' ? (adv.consentFile ? 'แนบใบคำยินยอมแล้ว' : 'ยังไม่แนบใบคำยินยอม') : CONSENT_LABELS[adv.consentStatus]}
                </Badge>
              </p>
              {adv.external && (
                <p className="mt-1 text-xs text-stone">
                  {[adv.external.position, adv.external.organization, adv.external.email, adv.external.phone].filter(Boolean).join(' · ')}
                </p>
              )}
              {adv.consentFile && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <FileLink fileId={adv.consentFile.id} label={adv.consentFile.originalName ?? 'ใบคำยินยอม'} />
                  {adv.consentVerified ? (
                    <span className="text-xs text-matcha-700">✓ เจ้าหน้าที่ตรวจแล้ว ({adv.consentVerified.byName ?? '-'})</span>
                  ) : (
                    <span className="text-xs text-mist">รอเจ้าหน้าที่ตรวจเอกสาร</span>
                  )}
                </div>
              )}
            </li>
          ))}
          {a.advisors.length === 0 && <li className="text-stone">-</li>}
        </ul>
      </section>

      {a.renewal && a.clubId ? (
        <section className="bento p-5 sm:p-6">
          <h2 className="mb-3 font-serif text-lg font-medium">คณะกรรมการและสมาชิกปัจจุบันของชมรม</h2>
          <RenewalContextPanel context={a.renewal} clubId={a.clubId} fiscalYear={a.fiscalYear} />
        </section>
      ) : (
        <>
          <section className="bento p-5 sm:p-6">
            <h2 className="font-serif text-lg font-medium">คณะกรรมการบริหาร ({a.committee.length} คน)</h2>
            <ul className="mt-2 divide-y divide-ink/[0.06] text-sm">
              {a.committee.map((c) => (
                <li key={c.user.id} className="py-2">
                  <span className="font-medium">{c.positionTitle}</span>: {c.user.name ?? c.user.email}
                  <span className="block text-xs text-mist">
                    {[c.user.orgUnitName, c.workLocation, c.contactPhone].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bento p-5 sm:p-6">
            <h2 className="font-serif text-lg font-medium">สมาชิกตั้งต้นเพิ่มเติม ({a.members.length} คน)</h2>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {a.members.map((m) => (
                <li key={m.id}>
                  {m.name ?? m.email} <span className="text-xs text-mist">{m.orgUnitName}</span>
                </li>
              ))}
            </ul>
          </section>

        </>
      )}

      <section className="bento p-5 sm:p-6">
        <h2 className="font-serif text-lg font-medium">แผนงานกิจกรรมประจำปี</h2>
        {a.activities.length === 0 ? (
          <p className="mt-2 text-sm text-stone">-</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {a.activities.map((act, i) => (
              <li key={i} className="flex gap-4 rounded-xl border border-ink/[0.06] bg-cream p-3">
                <div className="w-24 shrink-0 text-sm">
                  <p className="font-medium text-matcha-800">{formatDate(act.activityDate)}</p>
                  {act.activityTime && <p className="text-xs text-mist">{act.activityTime}</p>}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="text-ink">{act.title}</p>
                  {act.note && <p className="mt-0.5 text-xs text-stone">{act.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <details className="bento p-5 sm:p-6">
        <summary className="cursor-pointer font-serif text-lg font-medium">ระเบียบข้อบังคับของชมรม</summary>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">{a.regulationText}</pre>
      </details>
    </div>
  );
}
