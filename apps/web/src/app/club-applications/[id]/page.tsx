import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { FileLink } from '@/components/files/FileLink';
import { ActivitiesEditor } from '@/components/club-applications/ActivitiesEditor';
import { AdvisorsEditor } from '@/components/club-applications/AdvisorsEditor';
import { ApplicationSummary } from '@/components/club-applications/ApplicationSummary';
import { CommitteeEditor } from '@/components/club-applications/CommitteeEditor';
import { DeleteApplicationButton } from '@/components/club-applications/DeleteApplicationButton';
import { EventTimeline } from '@/components/club-applications/EventTimeline';
import { GeneralInfoForm } from '@/components/club-applications/GeneralInfoForm';
import { ClubLogo } from '@/components/clubs/ClubLogo';
import { LogoUploader } from '@/components/clubs/LogoUploader';
import { MembersEditor } from '@/components/club-applications/MembersEditor';
import { StatusBadge } from '@/components/club-applications/StatusBadge';
import { RenewalContextPanel } from '@/components/renewals/RenewalContextPanel';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiGetJson } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';
import { getCurrentUser } from '@/lib/auth';
import {
  APPLICATION_TYPE_LABELS,
  CONSENT_LABELS,
  PRESIDENT_CONSENT_LABELS,
  advisorDisplayName,
  type ApplicationDetail,
  type ClubCategory,
  type ClubPosition,
  type ValidationIssue,
} from '@/lib/club-application-types';

function Section({ title, children, tone = 'paper' }: { title: string; children: React.ReactNode; tone?: 'paper' | 'cream' }) {
  return (
    <Bento tone={tone}>
      <BentoTitle className="mb-4">{title}</BentoTitle>
      {children}
    </Bento>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect('/login');

  // API ตอบ 404 ถ้าผู้ใช้ไม่มีสิทธิ์ดูคำขอนี้
  const application = await apiGetJson<ApplicationDetail>(`/club-applications/${encodeURIComponent(id)}`);
  const base = `/club-applications/${application.id}`;
  const status = application.status;

  // บทบาทของผู้ดูในคำขอนี้ (ใช้เลือกสิ่งที่แสดงเท่านั้น API ตรวจซ้ำทุกการกระทำ)
  const has = (permission: string) =>
    current.roles.includes('super_admin') || current.permissions.includes(permission);
  const isApplicant = current.user.id === application.applicant.id;
  const myAdvisorRow = application.advisors.find(
    (a) => a.user?.id === current.user.id || a.email === current.user.email,
  );
  // ประธานที่ผู้ยื่นเสนอชื่อ (consentStatus ไม่ใช่ null = ต้องตอบรับผ่านระบบ)
  const nominatedPresident = application.committee.find((c) => c.position.code === 'president' && c.consentStatus !== null) ?? null;
  const isNominee = nominatedPresident?.user.id === current.user.id;
  const canEdit = isApplicant && (status === 'draft' || status === 'returned');
  const canReview = !isApplicant && status === 'submitted' && has('club_application:review');
  const canDecide = !isApplicant && status === 'reviewed' && has('club_application:approve');
  // ผู้ยื่นลบคำขอที่ยกเลิกแล้วออกจากรายการ / ผู้ดูแลระบบกู้คืนคำขอที่ยกเลิก (ลบแล้วหรือไม่ก็ได้) เป็นร่าง
  const canDelete = isApplicant && status === 'cancelled' && !application.deleted;
  const canRestore = status === 'cancelled' && has('club_application:manage_deleted');

  const [categories, positions, validation] = canEdit
    ? await Promise.all([
        apiGetJson<{ items: ClubCategory[] }>('/club-categories'),
        apiGetJson<{ items: ClubPosition[] }>('/club-positions'),
        apiGetJson<{ issues: ValidationIssue[] }>(`${base}/validation`),
      ])
    : [null, null, null];
  // เอกสารที่เจ้าหน้าที่ต้องตรวจ: ใบคำยินยอมของที่ปรึกษาภายนอก/บุคลากรที่แนบเอกสาร และใบตอบรับของผู้ถูกเสนอเป็นประธาน
  const documentAdvisors = application.advisors.filter((a) => a.kind === 'external' || a.consentFile);
  const presidentDocument = application.committee.find((c) => c.position.code === 'president' && c.consentFile) ?? null;
  const allAdvisorsAccepted =
    application.advisors.length > 0 && application.advisors.every((a) => a.consentStatus === 'accepted');
  const presidentAccepted = !nominatedPresident || nominatedPresident.consentStatus === 'accepted';
  const latestNote = [...application.events].reverse().find((e) => e.toStatus === status && e.note)?.note;

  return (
    <>
      <PageHeader
        eyebrow="Club Application"
        title={application.nameTh}
        description={`${APPLICATION_TYPE_LABELS[application.type]} ปีงบประมาณ ${application.fiscalYear} · ผู้ยื่น ${application.applicant.name ?? application.applicant.email}`}
        back={
          isApplicant || isNominee
            ? { href: '/club-applications', label: 'คำขอจัดตั้งชมรม' }
            : has('club:read_all')
              ? { href: '/club-applications/all', label: 'คำขอทั้งหมด' }
              : { href: '/', label: 'หน้าหลัก' }
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Link href={`${base}/document`} className="btn btn-secondary !min-h-10 text-sm">
              เอกสารสำหรับพิมพ์
            </Link>
          </div>
        }
      />

      {latestNote && (status === 'returned' || status === 'rejected' || status === 'draft') && (
        <p className="mb-4 rounded-bento border border-kin/20 bg-kin-50 px-5 py-4 text-[0.9375rem] text-kin">
          <span className="font-medium">หมายเหตุ:</span> {latestNote}
        </p>
      )}
      {application.deleted && (
        <p role="status" className="mb-4 rounded-bento border border-beni/30 bg-white px-5 py-4 text-[0.9375rem] text-beni">
          <span className="font-medium">ลบแล้ว:</span> ผู้ยื่นลบคำขอนี้ออกจากรายการเมื่อ {formatDateTime(application.deleted.at)}
          {application.deleted.byName ? ` (${application.deleted.byName})` : ''} — เห็นเฉพาะผู้ดูแลระบบ
        </p>
      )}
      {status === 'approved' && (
        <p className="mb-4 rounded-bento border border-matcha-200 bg-matcha-50 px-5 py-4 text-[0.9375rem] text-matcha-800">
          คำขอได้รับอนุมัติ ระบบสร้างชมรม กรรมการ ที่ปรึกษา และสมาชิกตั้งต้นเรียบร้อยแล้ว
        </p>
      )}

      {/* ---------- ส่วนดำเนินการตามบทบาท ---------- */}
      <div className="grid gap-3 sm:gap-4">
        {canEdit && validation && (
          <Section title="สิ่งที่ต้องทำก่อนส่งขอการตอบรับ" tone="cream">
            {validation.issues.length === 0 ? (
              <p className="text-sm text-matcha-700">
                ข้อมูลครบถ้วนแล้ว ส่งขอความยินยอมจากที่ปรึกษา{application.type === 'establish' ? ' และการตอบรับจากประธานที่คุณเสนอชื่อ (ถ้าไม่ใช่ตัวคุณเอง)' : ''}ได้
              </p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-kin">
                {validation.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/request-consent`} label="ส่งขอการตอบรับ" disabled={validation.issues.length > 0} />
              <ActionButton path={`${base}/cancel`} label="ยกเลิกคำขอ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {isApplicant && status === 'awaiting_consent' && (
          <Section title="รอการตอบรับ">
            <p className="text-sm text-stone">
              แจ้งที่ปรึกษาให้เข้าสู่ระบบด้วยอีเมลที่ระบุไว้ แล้วเปิดเมนู &quot;งานที่ปรึกษาชมรม&quot;
              {nominatedPresident && ' และแจ้งผู้ที่คุณเสนอเป็นประธานให้ตอบรับในเมนู "คำขอจัดตั้ง/ต่อทะเบียน"'}
              {' '}เมื่อตอบรับครบทุกคนจึงยื่นต่อสโมสรได้ (ระหว่างนี้แก้ไขคำขอไม่ได้ ต้องดึงกลับเป็นร่างก่อน)
            </p>
            <ul className="mt-3 grid gap-1 text-sm">
              {nominatedPresident && (
                <li>
                  ประธาน: {nominatedPresident.user.name ?? nominatedPresident.user.email} —{' '}
                  <span className={nominatedPresident.consentStatus === 'accepted' ? 'text-matcha-700' : 'text-kin'}>
                    {PRESIDENT_CONSENT_LABELS[nominatedPresident.consentStatus!]}
                    {nominatedPresident.consentFile && ' (แนบใบตอบรับ)'}
                  </span>
                </li>
              )}
              {application.advisors.map((a) => (
                <li key={a.sortOrder}>
                  ที่ปรึกษา: {advisorDisplayName(a)} —{' '}
                  <span className={a.consentStatus === 'accepted' ? 'text-matcha-700' : 'text-kin'}>
                    {CONSENT_LABELS[a.consentStatus]}
                    {a.consentFile && ' (แนบใบคำยินยอม)'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/submit`} label="ยื่นคำขอต่อสโมสร" disabled={!allAdvisorsAccepted || !presidentAccepted} />
              <ActionButton path={`${base}/withdraw`} label="ดึงกลับไปแก้ไข" tone="neutral" note="optional" />
              <ActionButton path={`${base}/cancel`} label="ยกเลิกคำขอ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {myAdvisorRow && status === 'awaiting_consent' && myAdvisorRow.consentStatus === 'pending' && (
          <Section title="คุณได้รับการเสนอชื่อเป็นที่ปรึกษาชมรม">
            <p className="text-sm text-stone">
              โปรดอ่านรายละเอียดคำขอด้านล่าง แล้วแจ้งความยินยอม (&quot;ข้าพเจ้ามีความยินดีและยินยอมรับเป็นที่ปรึกษาของชมรม&quot;)
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/advisor-response`} body={{ decision: 'accept' }} label="ยินยอมเป็นที่ปรึกษา" />
              <ActionButton path={`${base}/advisor-response`} body={{ decision: 'decline' }} label="ปฏิเสธ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {isNominee && status === 'awaiting_consent' && nominatedPresident?.consentStatus === 'pending' && (
          <Section title="คุณได้รับการเสนอชื่อเป็นประธานชมรม">
            <p className="text-sm text-stone">
              {application.applicant.name ?? application.applicant.email} เสนอชื่อคุณเป็นประธาน{application.nameTh.startsWith('ชมรม') ? '' : 'ชมรม'}
              {application.nameTh} โปรดอ่านรายละเอียดคำขอด้านล่าง เมื่อตอบรับแล้ว แบบขอจัดตั้งชมรมจะระบุคุณเป็นผู้ขอจัดตั้งในฐานะประธานชมรม
              (ผู้ยื่นเป็นผู้แก้ไขและยื่นคำขอ)
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/president-response`} body={{ decision: 'accept' }} label="ตอบรับเป็นประธาน" />
              <ActionButton path={`${base}/president-response`} body={{ decision: 'decline' }} label="ปฏิเสธ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {canDelete && (
          <Section title="คำขอนี้ถูกยกเลิกแล้ว">
            <p className="mb-4 text-sm text-stone">ลบคำขอออกจากรายการของคุณได้ หากไม่ต้องการเก็บไว้ดูอีก</p>
            <DeleteApplicationButton applicationId={application.id} />
          </Section>
        )}

        {canRestore && (
          <Section title="กู้คืนคำขอ (ผู้ดูแลระบบ)">
            <p className="mb-4 text-sm text-stone">
              คำขอจะกลับเป็นฉบับร่างของผู้ยื่นเดิม และแสดงในรายการคำขอของผู้ยื่นอีกครั้ง ผู้ยื่นต้องส่งขอการตอบรับและยื่นใหม่ตามขั้นตอน
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton path={`${base}/restore`} label="กู้คืนเป็นฉบับร่าง" note="required" />
            </div>
          </Section>
        )}

        {canReview && (
          <Section title="ตรวจคำขอ (ขั้นที่ 1 — เจ้าหน้าที่สโมสร)">
            {(documentAdvisors.length > 0 || presidentDocument) && (
              <div className="mb-4 grid gap-2">
                <p className="text-sm text-stone">
                  ตรวจเอกสารที่แนบแทนการตอบรับในระบบให้ครบก่อนกด &quot;ตรวจผ่าน&quot; (ถ้าเอกสารไม่ถูกต้อง ให้ส่งกลับแก้ไข)
                </p>
                {presidentDocument && presidentDocument.consentFile && (
                  <div className="flex flex-col gap-2 rounded-xl border border-ink/[0.08] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <p className="font-medium">ใบตอบรับเป็นประธาน: {presidentDocument.user.name ?? presidentDocument.user.email}</p>
                      <p className="text-xs text-stone">{presidentDocument.user.orgUnitName}</p>
                      <FileLink fileId={presidentDocument.consentFile.id} label="เปิดใบตอบรับ" />
                    </div>
                    {presidentDocument.consentVerified ? (
                      <span className="text-sm text-matcha-700">✓ ยืนยันเอกสารแล้ว</span>
                    ) : (
                      <ActionButton path={`${base}/president-consent/verify`} label="ยืนยันเอกสารถูกต้อง" tone="neutral" />
                    )}
                  </div>
                )}
                {documentAdvisors.map((adv) => (
                  <div key={adv.sortOrder} className="flex flex-col gap-2 rounded-xl border border-ink/[0.08] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <p className="font-medium">{advisorDisplayName(adv)}</p>
                      <p className="text-xs text-stone">{adv.kind === 'external' ? adv.external?.organization : 'บุคลากร มมส. (แนบใบคำยินยอมแทนการยินยอมในระบบ)'}</p>
                      {adv.consentFile ? <FileLink fileId={adv.consentFile.id} label="เปิดใบคำยินยอม" /> : <p className="text-xs text-kin">ยังไม่ได้แนบใบคำยินยอม</p>}
                    </div>
                    {adv.consentVerified ? (
                      <span className="text-sm text-matcha-700">✓ ยืนยันเอกสารแล้ว</span>
                    ) : adv.consentFile ? (
                      <ActionButton path={`${base}/advisors/${adv.sortOrder}/verify-consent`} label="ยืนยันเอกสารถูกต้อง" tone="neutral" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <ActionButton path={`${base}/review`} body={{ decision: 'pass' }} label="ตรวจผ่าน ส่งนายกสโมสร" note="optional" />
              <ActionButton path={`${base}/review`} body={{ decision: 'return' }} label="ส่งกลับแก้ไข" note="required" tone="neutral" />
            </div>
          </Section>
        )}

        {canDecide && (
          <Section title="พิจารณาอนุมัติ (ขั้นที่ 2 — นายกสโมสร)">
            <div className="flex flex-wrap gap-2">
              <ActionButton path={`${base}/decision`} body={{ decision: 'approve' }} label="อนุมัติ" note="optional" />
              <ActionButton path={`${base}/decision`} body={{ decision: 'return' }} label="ส่งกลับแก้ไข" note="required" tone="neutral" />
              <ActionButton path={`${base}/decision`} body={{ decision: 'reject' }} label="ไม่อนุมัติ" note="required" tone="danger" />
            </div>
          </Section>
        )}
      </div>

      {/* ---------- รายละเอียดคำขอ ---------- */}
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4">
        {canEdit && categories && positions ? (
          <>
            <Section title="1. ข้อมูลชมรม">
              <div className="mb-5 flex flex-col gap-3 border-b border-ink/[0.06] pb-5 sm:flex-row sm:items-center">
                <ClubLogo path={`/club-applications/${application.id}/logo`} fileId={application.logoFileId} name={application.nameTh} />
                <div className="grid gap-1">
                  <p className="text-sm font-medium">ตราสัญลักษณ์ชมรม (ไม่บังคับ)</p>
                  <LogoUploader attachPath={`/club-applications/${application.id}/logo`} hasLogo={Boolean(application.logoFileId)} />
                </div>
              </div>
              <GeneralInfoForm application={application} categories={categories.items} />
            </Section>
            <Section title="2. ที่ปรึกษาชมรม (1–5 คน)">
              <AdvisorsEditor application={application} />
            </Section>
            {application.renewal && application.clubId ? (
              <Section title="3–4. คณะกรรมการและสมาชิกปัจจุบันของชมรม">
                <RenewalContextPanel context={application.renewal} clubId={application.clubId} fiscalYear={application.fiscalYear} />
              </Section>
            ) : (
              <>
                <Section title="3. คณะกรรมการบริหารชมรม">
                  <CommitteeEditor application={application} positions={positions.items} />
                </Section>
                <Section title="4. รายชื่อสมาชิกตั้งต้น">
                  <MembersEditor application={application} />
                </Section>
              </>
            )}
            <Section title="5. แผนงานกิจกรรมประจำปี">
              <ActivitiesEditor application={application} />
            </Section>
          </>
        ) : (
          <ApplicationSummary application={application} />
        )}

        <Section title="ประวัติคำขอ">
          <EventTimeline events={application.events} />
        </Section>
      </div>
    </>
  );
}
