import Link from 'next/link';
import { DownloadMyDataButton } from '@/components/privacy/DownloadMyDataButton';
import { Bento, BentoTitle } from '@/components/ui/Bento';
import { PageHeader } from '@/components/ui/PageHeader';
import { CATEGORY_LABELS, LEVEL_LABELS, STATUS_LABELS as ACHIEVEMENT_STATUS } from '@/lib/achievement-types';
import { apiGetJson } from '@/lib/api-server';
import { APPLICATION_TYPE_LABELS, CONSENT_LABELS, STATUS_LABELS as APPLICATION_STATUS } from '@/lib/club-application-types';
import { OUTBOX_STATUS_LABELS } from '@/lib/email-settings-types';
import { formatDate, formatDateTime, formatTimestampDate } from '@/lib/format';
import type { MyData } from '@/lib/my-data-types';
import { DECISION_LABELS, KIND_LABELS } from '@/lib/selection-types';
import { MEDAL_LABELS } from '@/lib/sport-types';

const MEMBERSHIP_STATUS: Record<string, string> = { pending: 'รออนุมัติ', active: 'เป็นสมาชิก', rejected: 'ไม่อนุมัติ', ended: 'สิ้นสุดแล้ว', withdrawn: 'ถอนใบสมัคร' };
const FILE_PURPOSE: Record<string, string> = {
  activity_photo: 'รูปกิจกรรม',
  achievement_evidence: 'หลักฐานผลงาน',
  club_logo: 'ตราสัญลักษณ์ชมรม',
  advisor_consent: 'ใบคำยินยอมที่ปรึกษา',
};
const label = (map: Record<string, string>, value: string | null) => (value ? (map[value] ?? value) : '—');
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

// กลุ่มข้อมูล: หัวข้อ + จำนวน + แหล่งที่มา/วิธีแก้ไข + รายการ (ว่าง = แจ้งว่าไม่มีข้อมูล)
function Group({ title, count, source, children }: { title: string; count?: number; source: string; children: React.ReactNode }) {
  return (
    <Bento>
      <BentoTitle>
        {title}
        {count !== undefined && <span className="ml-2 text-sm font-normal text-stone">({count})</span>}
      </BentoTitle>
      <p className="mt-1 mb-3 text-sm text-stone">{source}</p>
      {count === 0 ? <p className="text-sm text-stone">ไม่มีข้อมูล</p> : children}
    </Bento>
  );
}

function Rows({ items }: { items: { key: string; primary: string; secondary?: string }[] }) {
  return (
    <ul className="grid grid-cols-1 divide-y divide-ink/[0.08]">
      {items.map((item) => (
        <li key={item.key} className="py-2 text-sm">
          <p className="font-medium break-words text-ink">{item.primary}</p>
          {item.secondary && <p className="break-words text-stone">{item.secondary}</p>}
        </li>
      ))}
    </ul>
  );
}

function Fields({ fields }: { fields: [string, string | null | undefined][] }) {
  return (
    <dl className="grid grid-cols-1 divide-y divide-ink/[0.08] text-sm">
      {fields.map(([name, value]) => (
        <div key={name} className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-stone">{name}</dt>
          <dd className="break-words text-ink">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ข้อมูลของฉัน (ต้อง login เท่านั้น — API คืนเฉพาะข้อมูลของผู้ใช้เอง): สิทธิขอเข้าถึง/รับสำเนา ตาม PDPA
export default async function MyDataPage() {
  const d = await apiGetJson<MyData>('/me/data');
  const s = d.staffProfile;

  return (
    <>
      <PageHeader
        eyebrow="My data"
        title="ข้อมูลของฉัน"
        description="ข้อมูลส่วนบุคคลของคุณทั้งหมดที่ระบบเก็บไว้ แยกตามกลุ่ม พร้อมแหล่งที่มาและวิธีแก้ไข"
        back={{ href: '/settings', label: 'การตั้งค่า' }}
      />

      <div className="grid gap-3 sm:gap-4">
        <Bento tone="cream">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm leading-relaxed text-ink">
              <p>
                ข้อมูล ณ {formatDateTime(d.generatedAt)} · ดาวน์โหลดเป็นไฟล์เพื่อเก็บสำเนาหรือนำไปใช้ต่อได้
              </p>
              <p className="mt-2">
                ต้องการขอแก้ไข ลบ ระงับ หรือคัดค้านการประมวลผล ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ของมหาวิทยาลัย:{' '}
                <a href="mailto:dpo@msu.ac.th" className="text-matcha-700 underline underline-offset-4">
                  dpo@msu.ac.th
                </a>{' '}
                โทร 0-4371-9800 ต่อ 2344 ·{' '}
                <Link href="/privacy" className="text-matcha-700 underline underline-offset-4">
                  ประกาศความเป็นส่วนตัว
                </Link>
              </p>
            </div>
            <div className="shrink-0">
              <DownloadMyDataButton />
            </div>
          </div>
        </Bento>

        <Group title="บัญชีผู้ใช้" source="จากบัญชี Google ของมหาวิทยาลัย อัปเดตทุกครั้งที่เข้าสู่ระบบ">
          <Fields
            fields={[
              ['อีเมล', d.account.email],
              ['ชื่อ', d.account.name],
              ['รูปโปรไฟล์', d.account.pictureUrl ? 'มี (จาก Google)' : 'ไม่มี'],
              ['บทบาทในระบบ', d.account.roles.map((r) => r.nameTh).join(', ')],
              ['เริ่มใช้ระบบ', formatDateTime(d.account.createdAt)],
              ['เข้าสู่ระบบล่าสุด', formatDateTime(d.account.lastLoginAt)],
              ['การเข้าสู่ระบบที่ยังใช้งาน', `${d.sessions.active} อุปกรณ์`],
            ]}
          />
        </Group>

        {s && (
          <Group title="ข้อมูลบุคลากร" source={`จากระบบบริหารงานบุคคล (ERP-HR) ซิงก์ล่าสุด ${formatDateTime(s.syncedAt)} — ไม่ถูกต้องแก้ไขที่งานบริหารบุคคล`}>
            <Fields
              fields={[
                ['รหัสบุคลากร', s.staffCode],
                ['ชื่อ-สกุล (ไทย)', `${s.prefixNameTh ?? ''}${s.firstNameTh ?? ''} ${s.lastNameTh ?? ''}`.trim()],
                ['ชื่อ-สกุล (อังกฤษ)', [s.prefixNameEn, s.firstNameEn, s.lastNameEn].filter(Boolean).join(' ')],
                ['ตำแหน่ง', s.positionNameTh],
                ['คณะ/หน่วยงาน', join(s.facultyName, s.departmentName)],
                ['หลักสูตร', s.programName],
              ]}
            />
          </Group>
        )}
        {d.studentProfile && (
          <Group title="ข้อมูลนิสิต" source="อนุมานจากอีเมลของมหาวิทยาลัย">
            <Fields fields={[['รหัสนิสิต', d.studentProfile.studentCode], ['คณะ', d.studentProfile.facultyName]]} />
          </Group>
        )}

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <Group title="สมาชิกภาพชมรม" count={d.memberships.length} source="จากการสมัครสมาชิกชมรม">
            <Rows
              items={d.memberships.map((m, i) => ({
                key: `${i}`,
                primary: `${m.clubName} — ${label(MEMBERSHIP_STATUS, m.status)}`,
                secondary: join(`สมัคร ${formatTimestampDate(m.appliedAt)}`, m.endedOn && `สิ้นสุด ${formatDate(m.endedOn)}`),
              }))}
            />
          </Group>

          <Group title="ตำแหน่งกรรมการชมรม" count={d.committeePositions.length} source="กรรมการชมรมบันทึก — แก้ไขได้ที่หน้าชมรม (เห็นเฉพาะกรรมการ/ที่ปรึกษา/สโมสร)">
            <Rows
              items={d.committeePositions.map((c, i) => ({
                key: `${i}`,
                primary: `${c.clubName} — ${c.positionTitle}`,
                secondary: join(`${formatDate(c.startedOn)}${c.endedOn ? ` – ${formatDate(c.endedOn)}` : ' – ปัจจุบัน'}`, c.contactPhone && `โทร ${c.contactPhone}`, c.workLocation, c.bio),
              }))}
            />
          </Group>

          <Group title="ที่ปรึกษาชมรม" count={d.advisorships.length} source="จากคำขอจัดตั้ง/ต่อทะเบียนที่คุณยินยอม">
            <Rows
              items={d.advisorships.map((a, i) => ({
                key: `${i}`,
                primary: `${a.clubName} — ปีงบประมาณ ${a.fiscalYear}`,
                secondary: `${formatDate(a.startedOn)}${a.endedOn ? ` – ${formatDate(a.endedOn)}` : ' – ปัจจุบัน'}`,
              }))}
            />
          </Group>

          <Group title="คำขอที่คุณยื่น" count={d.applications.length} source="คำขอจัดตั้ง/ต่อทะเบียนชมรม">
            <Rows
              items={d.applications.map((a, i) => ({
                key: `${i}`,
                primary: `${a.nameTh} — ${APPLICATION_TYPE_LABELS[a.type]}`,
                secondary: join(
                  label(APPLICATION_STATUS, a.status),
                  a.deletedAt && `ลบออกจากรายการเมื่อ ${formatTimestampDate(a.deletedAt)} (ระบบยังเก็บไว้)`,
                  `ปีงบประมาณ ${a.fiscalYear}`,
                  `สร้าง ${formatTimestampDate(a.createdAt)}`,
                ),
              }))}
            />
          </Group>

          <Group title="ชื่อของคุณในคำขอของผู้อื่น" count={d.applicationRoles.length} source="ผู้ยื่นคำขอระบุคุณเป็นที่ปรึกษาหรือกรรมการ">
            <Rows
              items={d.applicationRoles.map((r, i) => ({
                key: `${i}`,
                primary: `${r.applicationName} — ${r.role === 'advisor' ? 'ที่ปรึกษา' : `กรรมการ (${r.detail ?? '-'})`}`,
                secondary:
                  r.role === 'advisor'
                    ? `การยินยอม: ${label(CONSENT_LABELS, r.detail)}`
                    : join(r.contactPhone && `โทร ${r.contactPhone}`, r.workLocation, r.bio) || undefined,
              }))}
            />
          </Group>

          <Group title="ผลงาน" count={d.achievements.length} source="คุณบันทึกเอง กรรมการชมรมรับรอง">
            <Rows
              items={d.achievements.map((a, i) => ({
                key: `${i}`,
                primary: a.title,
                secondary: join(a.clubName, formatDate(a.achievedOn), label(LEVEL_LABELS, a.level), label(CATEGORY_LABELS, a.category), a.award, label(ACHIEVEMENT_STATUS, a.status)),
              }))}
            />
          </Group>

          <Group title="การเข้าร่วมกิจกรรม" count={d.activityParticipation.length} source="กรรมการชมรมบันทึกรายชื่อผู้เข้าร่วม">
            <Rows items={d.activityParticipation.map((a, i) => ({ key: `${i}`, primary: a.title, secondary: join(a.clubName, formatDate(a.heldOn)) }))} />
          </Group>

          <Group title="ทะเบียนนักกีฬา" count={d.athleteRecords.length} source="ชมรมกีฬาบันทึก (ไม่เก็บข้อมูลสุขภาพ)">
            <Rows
              items={d.athleteRecords.map((a, i) => ({
                key: `${i}`,
                primary: `${a.sportName} — ${a.clubName}`,
                secondary: join(a.eventOrPosition, `ตั้งแต่ ${formatDate(a.since)}`, a.endedAt && `สิ้นสุด ${formatTimestampDate(a.endedAt)}`),
              }))}
            />
          </Group>

          <Group title="ผลการแข่งขันและสถิติ" count={d.competitionResults.length} source="ชมรมกีฬาบันทึก">
            <Rows
              items={d.competitionResults.map((r, i) => ({
                key: `${i}`,
                primary: join(r.title, r.eventName),
                secondary: join(
                  r.sportName,
                  formatDate(r.heldFrom),
                  r.rank !== null && `อันดับ ${r.rank}`,
                  r.medal && label(MEDAL_LABELS, r.medal),
                  ...r.stats.map((st) => `${st.name} ${st.value}${st.unit ? ` ${st.unit}` : ''}`),
                ),
              }))}
            />
          </Group>

          <Group title="ผลการคัดเลือก" count={d.selectionResults.length} source="เฉพาะรอบที่ประกาศผลแล้ว (รอบที่ยังพิจารณาจะแสดงเมื่อประกาศผล)">
            <Rows
              items={d.selectionResults.map((r, i) => ({
                key: `${i}`,
                primary: `${r.roundTitle} — ${label(DECISION_LABELS, r.decision)}`,
                secondary: join(label(KIND_LABELS, r.kind), `ปีงบประมาณ ${r.fiscalYear}`, `เหตุผล: ${r.reason}`),
              }))}
            />
          </Group>

          <Group title="ไฟล์ที่คุณอัปโหลด" count={d.uploadedFiles.length} source="เก็บแบบไม่เปิดสาธารณะ เข้าถึงตามสิทธิ์ของข้อมูลที่แนบ">
            <Rows
              items={d.uploadedFiles.map((f, i) => ({
                key: `${i}`,
                primary: f.originalName,
                secondary: join(label(FILE_PURPOSE, f.purpose), `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB`, f.uploadedAt && formatTimestampDate(f.uploadedAt)),
              }))}
            />
          </Group>

          <Group title="อีเมลแจ้งเตือนถึงคุณ" count={d.emails.length} source="เก็บประวัติ 90 วัน">
            <Rows
              items={d.emails.map((e, i) => ({
                key: `${i}`,
                primary: e.subject,
                secondary: join(label(OUTBOX_STATUS_LABELS, e.status), formatDateTime(e.sentAt ?? e.createdAt)),
              }))}
            />
          </Group>

          <Group title="การรับทราบประกาศความเป็นส่วนตัว" count={d.privacyAcknowledgements.length} source="บันทึกเป็นหลักฐาน แก้ไข/ลบไม่ได้">
            <Rows items={d.privacyAcknowledgements.map((a, i) => ({ key: `${i}`, primary: `เวอร์ชัน ${a.version}`, secondary: formatDateTime(a.acknowledgedAt) }))} />
          </Group>
        </div>
      </div>
    </>
  );
}
