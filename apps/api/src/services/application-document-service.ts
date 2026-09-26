import { listActiveClubCategories } from '../repositories/club-master-repository.js';
import {
  findApplicationBase,
  findApplicationDetail,
  findOrgUnitNames,
  listActivityDetails,
  listAdvisorDetails,
  listCommitteeDetails,
  listMemberDetails,
} from '../repositories/club-applications-repository.js';
import { listActiveMembers, listCurrentCommittee } from '../repositories/clubs-repository.js';
import type { AuthContext } from './authorization.js';
import { assertCanView, notFound } from './club-application-service.js';

/**
 * ข้อมูลสำหรับพิมพ์ชุดเอกสารคำขอ (แบบฟอร์มสโมสร 11 รายการ) — ผู้ที่ดูคำขอนี้ได้เท่านั้น
 * - คำขอจัดตั้ง: กรรมการ/สมาชิกจากคำขอ (สมาชิก = กรรมการ ∪ สมาชิกที่ระบุ)
 * - คำขอต่อทะเบียน: กรรมการ/สมาชิกปัจจุบันของชมรม
 * เบอร์โทรเฉพาะกรรมการ (ระบบไม่เก็บเบอร์ของสมาชิก — ในแบบฟอร์มเว้นช่องไว้เขียนเอง)
 */
export async function getApplicationDocument(auth: AuthContext, applicationId: string) {
  const base = await findApplicationBase(applicationId);
  if (!base) throw notFound();
  await assertCanView(auth, base);

  const [detail, advisors, activities, categories] = await Promise.all([
    findApplicationDetail(applicationId),
    listAdvisorDetails(applicationId),
    listActivityDetails(applicationId),
    listActiveClubCategories(),
  ]);
  if (!detail) throw notFound();

  let committee: { name: string; positionCode: string; positionTitle: string; orgUnitName: string | null; workLocation: string | null; contactPhone: string | null; bio: string | null }[];
  let members: { name: string; orgUnitName: string | null }[];
  if (detail.type === 'renewal' && detail.clubId) {
    const [clubCommittee, clubMembers] = await Promise.all([listCurrentCommittee(detail.clubId), listActiveMembers(detail.clubId, 1000, 0)]);
    committee = clubCommittee.map((c) => ({
      name: c.name ?? c.email,
      positionCode: c.positionCode,
      positionTitle: c.positionTitle,
      orgUnitName: c.orgUnitName,
      workLocation: c.workLocation,
      contactPhone: c.contactPhone,
      bio: null,
    }));
    members = clubMembers.items.map((m) => ({ name: m.name ?? m.email, orgUnitName: m.orgUnitName }));
  } else {
    const [appCommittee, appMembers] = await Promise.all([listCommitteeDetails(applicationId), listMemberDetails(applicationId)]);
    committee = appCommittee.map((c) => ({
      name: c.userName ?? c.userEmail,
      positionCode: c.positionCode,
      positionTitle: c.positionTitle,
      orgUnitName: c.orgUnitName,
      workLocation: c.workLocation,
      contactPhone: c.contactPhone,
      bio: c.bio,
    }));
    const committeeIds = new Set(appCommittee.map((c) => c.userId));
    members = [
      ...appCommittee.map((c) => ({ name: c.userName ?? c.userEmail, orgUnitName: c.orgUnitName })),
      ...appMembers.filter((m) => !committeeIds.has(m.userId)).map((m) => ({ name: m.userName ?? m.userEmail, orgUnitName: m.orgUnitName })),
    ];
  }

  const orgUnits = await findOrgUnitNames([detail.applicantUserId, ...advisors.flatMap((a) => (a.userId ? [a.userId] : []))]);
  return {
    id: detail.id,
    type: detail.type,
    status: detail.status,
    fiscalYear: detail.fiscalYear,
    submittedAt: detail.submittedAt,
    nameTh: detail.nameTh,
    applicant: { name: detail.applicantName ?? detail.applicantEmail, orgUnitName: orgUnits.get(detail.applicantUserId) ?? null },
    categoryCode: detail.categoryCode,
    categoryDetail: detail.categoryDetail,
    categories: categories.map((c) => ({ code: c.code, nameTh: c.nameTh })),
    history: detail.history,
    motto: detail.motto,
    logoMeaning: detail.logoMeaning,
    logoFileId: detail.logoFileId,
    objectives: detail.objectives,
    officeLocation: detail.officeLocation,
    contactPhone: detail.contactPhone,
    contactEmail: detail.contactEmail,
    regulationText: detail.regulationText,
    advisors: advisors.map((a) => ({
      name: a.external
        ? `${a.external.prefixTh ?? ''}${a.external.firstNameTh} ${a.external.lastNameTh}`
        : (a.userName ?? a.email ?? ''),
      orgUnitName: a.external ? a.external.organization : a.userId ? (orgUnits.get(a.userId) ?? null) : null,
      kind: a.external ? ('external' as const) : ('internal' as const),
      consentStatus: a.consentStatus,
      respondedAt: a.respondedAt,
    })),
    committee,
    members,
    activities,
  };
}
