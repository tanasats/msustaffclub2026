import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionButton } from '@/components/club-applications/ActionButton';
import { ActivitiesEditor } from '@/components/club-applications/ActivitiesEditor';
import { AdvisorsEditor } from '@/components/club-applications/AdvisorsEditor';
import { ApplicationSummary } from '@/components/club-applications/ApplicationSummary';
import { CommitteeEditor } from '@/components/club-applications/CommitteeEditor';
import { EventTimeline } from '@/components/club-applications/EventTimeline';
import { GeneralInfoForm } from '@/components/club-applications/GeneralInfoForm';
import { MembersEditor } from '@/components/club-applications/MembersEditor';
import { StatusBadge } from '@/components/club-applications/StatusBadge';
import { apiGetJson } from '@/lib/api-server';
import { getCurrentUser } from '@/lib/auth';
import type {
  ApplicationDetail,
  ClubCategory,
  ClubPosition,
  ValidationIssue,
} from '@/lib/club-application-types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
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
  const canEdit = isApplicant && (status === 'draft' || status === 'returned');
  const canReview = !isApplicant && status === 'submitted' && has('club_application:review');
  const canDecide = !isApplicant && status === 'reviewed' && has('club_application:approve');

  const [categories, positions, validation] = canEdit
    ? await Promise.all([
        apiGetJson<{ items: ClubCategory[] }>('/club-categories'),
        apiGetJson<{ items: ClubPosition[] }>('/club-positions'),
        apiGetJson<{ issues: ValidationIssue[] }>(`${base}/validation`),
      ])
    : [null, null, null];
  const allAdvisorsAccepted =
    application.advisors.length > 0 && application.advisors.every((a) => a.consentStatus === 'accepted');
  const latestNote = [...application.events].reverse().find((e) => e.toStatus === status && e.note)?.note;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href={isApplicant ? '/club-applications' : '/'} className="text-sm text-blue-700 underline">
        ← {isApplicant ? 'คำขอของฉัน' : 'หน้าแรก'}
      </Link>

      <header className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{application.nameTh}</h1>
          <p className="text-sm text-slate-600">
            คำขอจัดตั้งชมรม ปีงบประมาณ {application.fiscalYear} · ผู้ยื่น {application.applicant.name ?? application.applicant.email}
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      {latestNote && (status === 'returned' || status === 'rejected' || status === 'draft') && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-medium">หมายเหตุ:</span> {latestNote}
        </p>
      )}
      {status === 'approved' && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-900">
          คำขอได้รับอนุมัติ ระบบสร้างชมรม กรรมการ ที่ปรึกษา และสมาชิกตั้งต้นเรียบร้อยแล้ว
        </p>
      )}

      {/* ---------- ส่วนดำเนินการตามบทบาท ---------- */}
      <div className="mt-6 grid gap-4">
        {canEdit && validation && (
          <Section title="สิ่งที่ต้องทำก่อนส่งให้ที่ปรึกษายินยอม">
            {validation.issues.length === 0 ? (
              <p className="text-sm text-green-800">ข้อมูลครบถ้วนแล้ว ส่งให้ที่ปรึกษายินยอมได้</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-amber-900">
                {validation.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/request-consent`} label="ส่งให้ที่ปรึกษายินยอม" disabled={validation.issues.length > 0} />
              <ActionButton path={`${base}/cancel`} label="ยกเลิกคำขอ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {isApplicant && status === 'awaiting_consent' && (
          <Section title="รอที่ปรึกษายินยอม">
            <p className="text-sm text-slate-600">
              แจ้งที่ปรึกษาให้เข้าสู่ระบบด้วยอีเมลที่ระบุไว้ แล้วเปิดเมนู &quot;คำขอที่เสนอชื่อฉันเป็นที่ปรึกษา&quot;
              เมื่อยินยอมครบทุกคนจึงยื่นต่อสโมสรได้ (ระหว่างนี้แก้ไขคำขอไม่ได้ ต้องดึงกลับเป็นร่างก่อน)
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/submit`} label="ยื่นคำขอต่อสโมสร" disabled={!allAdvisorsAccepted} />
              <ActionButton path={`${base}/withdraw`} label="ดึงกลับไปแก้ไข" tone="neutral" note="optional" />
              <ActionButton path={`${base}/cancel`} label="ยกเลิกคำขอ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {myAdvisorRow && status === 'awaiting_consent' && myAdvisorRow.consentStatus === 'pending' && (
          <Section title="คุณได้รับการเสนอชื่อเป็นที่ปรึกษาชมรม">
            <p className="text-sm text-slate-600">
              โปรดอ่านรายละเอียดคำขอด้านล่าง แล้วแจ้งความยินยอม (&quot;ข้าพเจ้ามีความยินดีและยินยอมรับเป็นที่ปรึกษาของชมรม&quot;)
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton path={`${base}/advisor-response`} body={{ decision: 'accept' }} label="ยินยอมเป็นที่ปรึกษา" />
              <ActionButton path={`${base}/advisor-response`} body={{ decision: 'decline' }} label="ปฏิเสธ" note="optional" tone="danger" />
            </div>
          </Section>
        )}

        {canReview && (
          <Section title="ตรวจคำขอ (ขั้นที่ 1 — เจ้าหน้าที่สโมสร)">
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
      <div className="mt-6 grid gap-4">
        {canEdit && categories && positions ? (
          <>
            <Section title="1. ข้อมูลชมรม">
              <GeneralInfoForm application={application} categories={categories.items} />
            </Section>
            <Section title="2. ที่ปรึกษาชมรม (1–2 คน)">
              <AdvisorsEditor application={application} />
            </Section>
            <Section title="3. คณะกรรมการบริหารชมรม">
              <CommitteeEditor application={application} positions={positions.items} />
            </Section>
            <Section title="4. รายชื่อสมาชิกตั้งต้น">
              <MembersEditor application={application} />
            </Section>
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
    </main>
  );
}
